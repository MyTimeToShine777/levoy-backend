package com.levoy.app.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.levoy.app.R
import com.levoy.app.model.FollowUp
import com.levoy.app.network.ApiClient
import com.levoy.app.util.Fmt
import com.levoy.app.util.Ui
import com.levoy.app.util.Ui.hide
import com.levoy.app.util.Ui.show
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.textfield.TextInputEditText
import java.util.Calendar

/**
 * The due / overdue / upcoming queue from GET /api/follow-ups/due, with
 * complete and reschedule actions backed by PATCH /api/follow-ups/:id.
 */
class FollowUpsFragment : Fragment() {

    private var api: ApiClient? = null
    private var adapter: FollowUpsAdapter? = null
    private var scopeIndex = 0

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_follow_ups, container, false)
        api = ApiClient(requireContext())

        val recycler = view.findViewById<RecyclerView>(R.id.recyclerFollowUps)
        recycler.layoutManager = LinearLayoutManager(context)
        adapter = FollowUpsAdapter(
            onComplete = { complete(it) },
            onReschedule = { reschedule(it) }
        )
        recycler.adapter = adapter

        view.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh).apply {
            setColorSchemeColors(requireContext().getColor(R.color.accent))
            setOnRefreshListener { refresh() }
        }

        buildScopeChips(view.findViewById(R.id.followUpScopeChips))

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

        api?.getFollowUps(scope = scopes[scopeIndex])?.onSuccess { items ->
            if (view == null) return@onSuccess
            // Overdue first, then soonest — the queue is a to-do list.
            val sorted = items.sortedWith(
                compareByDescending<FollowUp> { it.is_overdue }
                    .thenBy { it.due_at ?: "" }
            )
            adapter?.submitList(sorted)

            val summary = root.findViewById<TextView>(R.id.tvFollowUpSummary)
            summary.text = getString(R.string.followups_count, sorted.size)
            summary.showIf(sorted.isNotEmpty())

            Ui.hideBoth(emptyState, errorState)
            if (sorted.isEmpty()) {
                val isOverdueScope = scopes[scopeIndex] == "overdue"
                Ui.showEmptyState(
                    emptyState, R.drawable.ic_followups,
                    if (isOverdueScope) R.string.empty_followups_overdue_title
                    else R.string.empty_followups_title,
                    if (isOverdueScope) R.string.empty_followups_overdue_body
                    else R.string.empty_followups_body
                )
            }
            swipe.isRefreshing = false
        }?.onFailure { error ->
            if (view == null) return@onFailure
            swipe.isRefreshing = false
            adapter?.submitList(emptyList())
            emptyState.hide()
            Ui.showErrorState(errorState, requireContext()) { refresh() }
            errorState.findViewById<TextView>(R.id.errorBody).text =
                getString(R.string.followups_load_failed) + " " + (error.message ?: "")
        }
    }

    private fun buildScopeChips(group: ChipGroup) {
        val labels = resources.getStringArray(R.array.followup_scopes)
        labels.forEachIndexed { index, label ->
            val chip = layoutInflater.inflate(R.layout.item_tag_chip, group, false) as Chip
            chip.text = label
            chip.isChecked = index == 0
            chip.setOnClickListener {
                scopeIndex = index
                refresh()
            }
            group.addView(chip)
        }
    }

    // ─── Actions ───

    private fun complete(followUp: FollowUp) {
        api?.updateFollowUp(followUp.id, mapOf("status" to "completed"))
            ?.onSuccess {
                refresh()
                Toast.makeText(requireContext(), R.string.followup_completed, Toast.LENGTH_SHORT).show()
            }
            ?.onFailure { error -> toastError(error.message) }
    }

    /** Row tap: complete the follow-up and record what happened. */
    private fun completeWithNote(followUp: FollowUp) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_note, null)
        val notesField = dialogView.findViewById<TextInputEditText>(R.id.etNote)

        AlertDialog.Builder(requireContext())
            .setTitle(R.string.followup_complete)
            .setView(dialogView)
            .setPositiveButton(R.string.followup_complete) { _, _ ->
                val notes = notesField.text?.toString()?.trim().orEmpty()
                val body = mutableMapOf<String, Any>("status" to "completed")
                if (notes.isNotEmpty()) {
                    body["notes"] = notes
                    body["outcome"] = "completed"
                }
                api?.updateFollowUp(followUp.id, body)?.onSuccess {
                    refresh()
                    Toast.makeText(requireContext(), R.string.followup_completed, Toast.LENGTH_SHORT).show()
                }?.onFailure { error -> toastError(error.message) }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun reschedule(followUp: FollowUp) {
        val labels = resources.getStringArray(R.array.followup_reschedule_options)
        val offsets = listOf(2, 24, 24 * 7) // hours from now

        AlertDialog.Builder(requireContext())
            .setTitle(R.string.followup_reschedule)
            .setItems(labels) { _, which ->
                val cal = Calendar.getInstance()
                cal.add(Calendar.HOUR_OF_DAY, offsets.getOrElse(which) { 24 })
                val body = mapOf<String, Any>(
                    "status" to "pending",
                    "due_at" to Fmt.isoDateTime(cal.time)
                )
                api?.updateFollowUp(followUp.id, body)?.onSuccess {
                    refresh()
                    Toast.makeText(requireContext(), R.string.followup_rescheduled, Toast.LENGTH_SHORT).show()
                }?.onFailure { error -> toastError(error.message) }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun toastError(message: String?) {
        Toast.makeText(requireContext(), message ?: getString(R.string.error_title), Toast.LENGTH_SHORT).show()
    }

    // ─── Adapter ───

    inner class FollowUpsAdapter(
        private val onComplete: (FollowUp) -> Unit,
        private val onReschedule: (FollowUp) -> Unit
    ) : RecyclerView.Adapter<FollowUpsAdapter.Holder>() {

        private var items: List<FollowUp> = emptyList()

        fun submitList(list: List<FollowUp>) {
            items = list
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_follow_up, parent, false))

        override fun onBindViewHolder(holder: Holder, position: Int) = holder.bind(items[position], position)

        override fun getItemCount(): Int = items.size

        inner class Holder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val name: TextView = itemView.findViewById(R.id.tvFollowUpName)
            private val badge: TextView = itemView.findViewById(R.id.tvFollowUpBadge)
            private val type: TextView = itemView.findViewById(R.id.tvFollowUpType)
            private val due: TextView = itemView.findViewById(R.id.tvFollowUpDue)
            private val notes: TextView = itemView.findViewById(R.id.tvFollowUpNotes)
            private val divider: View = itemView.findViewById(R.id.followUpDivider)

            fun bind(followUp: FollowUp, position: Int) {
                val context = itemView.context
                name.text = followUp.contactName
                type.text = followUp.typeLabel
                due.text = followUp.due_at?.let { Fmt.dateTime(context, it) } ?: "—"

                val badgeRes = when {
                    followUp.is_overdue -> R.string.followup_overdue_badge
                    scopeIndex == 2 -> R.string.followup_upcoming_badge
                    else -> R.string.followup_due_badge
                }
                badge.setText(badgeRes)
                val badgeColor = when {
                    followUp.is_overdue -> R.color.danger
                    else -> R.color.accent
                }
                badge.setTextColor(ContextCompat.getColor(context, badgeColor))

                val note = followUp.notes?.takeIf { it.isNotBlank() }
                notes.text = note
                notes.showIf(note != null)

                Ui.applyDivider(divider, position, items.size)

                itemView.findViewById<ImageButton>(R.id.btnCompleteFollowUp).setOnClickListener {
                    onComplete(followUp)
                }
                itemView.findViewById<ImageButton>(R.id.btnRescheduleFollowUp).setOnClickListener {
                    onReschedule(followUp)
                }
                itemView.setOnClickListener { completeWithNote(followUp) }
            }
        }
    }

    companion object {
        /** Index-aligned with R.array.followup_scopes. */
        private val scopes = listOf("today", "overdue", "upcoming", "all")

        fun newInstance() = FollowUpsFragment()
    }
}