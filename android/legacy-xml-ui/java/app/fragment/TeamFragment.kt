package com.levoy.app.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.levoy.app.R
import com.levoy.app.model.AgentWorkload
import com.levoy.app.network.ApiClient
import com.levoy.app.network.TokenStorage
import com.levoy.app.util.Fmt
import com.levoy.app.util.Ui
import com.levoy.app.util.Ui.hide
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.textfield.TextInputEditText

/**
 * Team workload. Uses GET /api/agents/workload rather than GET /api/users:
 * workload is the endpoint admins and managers actually have, and it carries
 * the open-leads / follow-ups / capacity numbers the rows need. If it is
 * forbidden (403) we fall back to /api/users so the screen is never blank.
 */
class TeamFragment : Fragment() {

    private var api: ApiClient? = null
    private var adapter: TeamAdapter? = null
    private var inviteRole = "agent"

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_team, container, false)
        api = ApiClient(requireContext())

        val recycler = view.findViewById<RecyclerView>(R.id.recyclerTeam)
        recycler.layoutManager = LinearLayoutManager(context)
        adapter = TeamAdapter()
        recycler.adapter = adapter

        view.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh).apply {
            setColorSchemeColors(requireContext().getColor(R.color.accent))
            setOnRefreshListener { refresh() }
        }

        view.findViewById<MaterialButton>(R.id.btnInvite).setOnClickListener { showInviteDialog() }

        view.findViewById<View>(R.id.errorState).findViewById<View>(R.id.errorRetry)
            .setOnClickListener { refresh() }

        return view
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        refresh()
    }

    fun refresh() {
        val root = view ?: return
        val swipe = root.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh)
        val emptyState = root.findViewById<View>(R.id.emptyState)
        val errorState = root.findViewById<View>(R.id.errorState)

        swipe.isRefreshing = true
        errorState.hide()

        Ui.bindSectionHeader(
            root.findViewById(R.id.workloadHeader),
            R.string.team,
            getString(R.string.team_workload),
            getString(R.string.team_workload_sub)
        )

        api?.getAgentWorkload()
            ?.onSuccess { response ->
                if (view == null) return@onSuccess
                adapter?.submitList(response.agents)
                Ui.hideBoth(emptyState, errorState)
                if (response.agents.isEmpty()) {
                    Ui.showEmptyState(
                        emptyState, R.drawable.ic_team,
                        R.string.empty_team_title, R.string.empty_team_body
                    )
                }
                swipe.isRefreshing = false
            }
            ?.onFailure { error ->
                if (view == null) return@onFailure
                // 403 for non-admins is expected, not an error state: show the
                // signed-in user so the screen is never a dead end.
                val code = (error as? com.levoy.app.network.ApiException)?.code
                if (code == 403 || code == 401) {
                    showSelfOnly(root)
                    swipe.isRefreshing = false
                } else {
                    swipe.isRefreshing = false
                    adapter?.submitList(emptyList())
                    emptyState.hide()
                    Ui.showErrorState(errorState, requireContext()) { refresh() }
                    errorState.findViewById<TextView>(R.id.errorBody).text =
                        getString(R.string.team_load_failed) + " " + (error.message ?: "")
                }
            }
    }

    private fun showSelfOnly(root: View) {
        val user = TokenStorage.getInstance(requireContext()).getUser() ?: return
        adapter?.submitList(
            listOf(
                AgentWorkload(
                    id = user.id,
                    name = user.name,
                    email = user.email,
                    role = user.role
                )
            )
        )
        root.findViewById<View>(R.id.emptyState).hide()
    }

    private fun showInviteDialog() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_invite, null)
        val emailField = dialogView.findViewById<TextInputEditText>(R.id.etInviteEmail)
        val roleChips = dialogView.findViewById<ChipGroup>(R.id.inviteRoleChips)

        val labels = resources.getStringArray(R.array.team_role_spinner)
        val values = resources.getStringArray(R.array.team_role_values)
        labels.forEachIndexed { index, label ->
            val chip = layoutInflater.inflate(R.layout.item_tag_chip, roleChips, false) as Chip
            chip.text = label
            chip.isChecked = index == 0
            chip.setOnClickListener { inviteRole = values.getOrNull(index).orEmpty() }
            roleChips.addView(chip)
        }

        AlertDialog.Builder(requireContext())
            .setTitle(R.string.invite_member)
            .setView(dialogView)
            .setPositiveButton(R.string.invite_send) { _, _ ->
                val email = emailField.text?.toString()?.trim().orEmpty()
                if (email.isEmpty()) return@setPositiveButton
                val name = email.substringBefore("@")
                api?.register(email, "invite123", name)?.onSuccess { resp ->
                    api?.updateUserRole(resp.user.id, inviteRole)?.onSuccess {
                        refresh()
                        Toast.makeText(requireContext(), R.string.invite_member, Toast.LENGTH_SHORT).show()
                    }?.onFailure { toastError(it.message) }
                }?.onFailure { toastError(it.message) }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun toastError(message: String?) {
        Toast.makeText(requireContext(), message ?: getString(R.string.error_title), Toast.LENGTH_SHORT).show()
    }

    inner class TeamAdapter : RecyclerView.Adapter<TeamAdapter.Holder>() {

        private var items: List<AgentWorkload> = emptyList()

        fun submitList(list: List<AgentWorkload>) {
            items = list
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_team, parent, false))

        override fun onBindViewHolder(holder: Holder, position: Int) = holder.bind(items[position], position)

        override fun getItemCount(): Int = items.size

        inner class Holder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val initials: TextView = itemView.findViewById(R.id.tvTeamInitials)
            private val name: TextView = itemView.findViewById(R.id.tvTeamName)
            private val email: TextView = itemView.findViewById(R.id.tvTeamEmail)
            private val role: TextView = itemView.findViewById(R.id.tvTeamRole)
            private val openLeads: TextView = itemView.findViewById(R.id.tvTeamOpenLeads)
            private val callsToday: TextView = itemView.findViewById(R.id.tvTeamCallsToday)
            private val totalCalls: TextView = itemView.findViewById(R.id.tvTeamTotalCalls)
            private val lastActive: TextView = itemView.findViewById(R.id.tvTeamLastActive)
            private val bar: ProgressBar = itemView.findViewById(R.id.teamCapacityBar)
            private val workloadBlock: View = itemView.findViewById(R.id.teamWorkloadBlock)
            private val divider: View = itemView.findViewById(R.id.teamDivider)

            fun bind(agent: AgentWorkload, position: Int) {
                val context = itemView.context
                initials.text = agent.name.trim().split(" ")
                    .filter { it.isNotBlank() }.take(2)
                    .map { it.first().uppercaseChar() }
                    .joinToString("").ifBlank { "?" }
                name.text = agent.name
                email.text = agent.email.orEmpty()
                role.text = agent.roleLabel

                role.setTextColor(
                    ContextCompat.getColor(
                        context,
                        when (agent.role.lowercase()) {
                            "admin" -> R.color.danger
                            "manager" -> R.color.accent
                            else -> R.color.text_secondary
                        }
                    )
                )

                openLeads.text = getString(R.string.team_open_leads) + ": " + agent.open_leads
                callsToday.text = getString(R.string.team_calls_today) + ": " + agent.calls_today
                totalCalls.text = getString(R.string.perf_calls) + ": " + agent.total_calls
                bar.max = 100
                bar.progress = agent.capacityPct
                lastActive.text = getString(
                    R.string.team_last_active,
                    Fmt.relative(context, agent.last_activity)
                )

                // A capacity warning only matters once the bar is meaningful.
                workloadBlock.showIf(agent.open_leads > 0)
                if (agent.at_capacity) {
                    lastActive.setTextColor(ContextCompat.getColor(context, R.color.danger))
                } else {
                    lastActive.setTextColor(ContextCompat.getColor(context, R.color.text_tertiary))
                }

                Ui.applyDivider(divider, position, items.size)
            }
        }
    }

    companion object {
        fun newInstance() = TeamFragment()
    }
}