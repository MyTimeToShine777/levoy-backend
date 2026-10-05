package com.levoy.app.fragment

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.levoy.app.R
import com.levoy.app.model.Lead
import com.levoy.app.network.ApiClient
import com.levoy.app.util.Fmt
import com.levoy.app.util.Ui
import com.levoy.app.util.Ui.hide
import com.levoy.app.util.Ui.show
import com.levoy.app.util.Ui.showIf
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.textfield.TextInputEditText

/**
 * Leads list with status chips, search, and add/edit. Status and priority use
 * chip groups rather than spinners so they match the reference's rounded,
 * amber-selected controls.
 */
class LeadsFragment : Fragment() {

    private var api: ApiClient? = null
    private var adapter: LeadsAdapter? = null

    private var statusIndex = 0
    private var searchQuery: String? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_leads, container, false)
        api = ApiClient(requireContext())

        val recycler = view.findViewById<RecyclerView>(R.id.recyclerLeads)
        recycler.layoutManager = LinearLayoutManager(context)
        adapter = LeadsAdapter(
            onCall = { placeCall(it.phone) },
            onEdit = { showEditDialog(it) },
            onRowClick = { showLeadSheet(it) }
        )
        recycler.adapter = adapter

        view.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh).apply {
            setColorSchemeColors(requireContext().getColor(R.color.accent))
            setOnRefreshListener { refresh() }
        }

        buildStatusChips(view.findViewById(R.id.leadStatusChips))

        view.findViewById<EditText>(R.id.etSearchLeads).doAfterTextChanged { text ->
            searchQuery = text?.toString()?.trim()?.takeIf { it.isNotEmpty() }
            refresh()
        }

        view.findViewById<MaterialButton>(R.id.btnAddLead).setOnClickListener {
            showAddDialog()
        }

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

        val status = statusValues[statusIndex]
        api?.getLeads(status = status, search = searchQuery)
            ?.onSuccess { leads ->
                if (view == null) return@onSuccess
                adapter?.submitList(leads)
                bindSummary(root, leads.size)
                Ui.hideBoth(emptyState, errorState)
                if (leads.isEmpty()) {
                    Ui.showEmptyState(
                        emptyState, R.drawable.ic_leads,
                        if (hasActiveFilters()) R.string.empty_leads_filtered_title
                        else R.string.empty_leads_title,
                        if (hasActiveFilters()) R.string.empty_leads_filtered_body
                        else R.string.empty_leads_body,
                        if (hasActiveFilters()) getString(R.string.reset) else null
                    ) { clearFilters(root) }
                }
                swipe.isRefreshing = false
            }
            ?.onFailure { error ->
                if (view == null) return@onFailure
                swipe.isRefreshing = false
                adapter?.submitList(emptyList())
                emptyState.hide()
                Ui.showErrorState(errorState, requireContext()) { refresh() }
                errorState.findViewById<TextView>(R.id.errorBody).text =
                    getString(R.string.leads_load_failed) + " " + (error.message ?: "")
            }
    }

    private fun hasActiveFilters(): Boolean = statusIndex != 0 || !searchQuery.isNullOrBlank()

    private fun clearFilters(root: View) {
        statusIndex = 0
        root.findViewById<ChipGroup>(R.id.leadStatusChips).let { group ->
            (group.getChildAt(0) as? Chip)?.isChecked = true
        }
        root.findViewById<EditText>(R.id.etSearchLeads).setText("")
        refresh()
    }

    private fun buildStatusChips(group: ChipGroup) {
        val labels = resources.getStringArray(R.array.lead_status_filter)
        labels.forEachIndexed { index, label ->
            val chip = layoutInflater.inflate(R.layout.item_tag_chip, group, false) as Chip
            chip.text = label
            chip.isChecked = index == 0
            chip.setOnClickListener {
                statusIndex = index
                refresh()
            }
            group.addView(chip)
        }
    }

    private fun bindSummary(root: View, count: Int) {
        val summary = root.findViewById<TextView>(R.id.tvLeadSummary)
        val labels = resources.getStringArray(R.array.lead_status_values)
        val noun = labels.getOrNull(statusIndex)?.replaceFirstChar { it.uppercase() }
        summary.text = if (noun != null && statusIndex != 0) {
            "$count ${noun.lowercase()}"
        } else {
            getString(R.string.filter_results_label, count.toString())
        }
        summary.showIf(count > 0)
    }

    private fun placeCall(number: String) {
        runCatching {
            startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")))
        }.onFailure {
            Toast.makeText(requireContext(), R.string.no_app_handles_call, Toast.LENGTH_SHORT).show()
        }
    }

    // ─── Add / edit ───

    private fun showAddDialog() {
        showLeadDialog(titleRes = R.string.add_lead, existing = null)
    }

    private fun showEditDialog(lead: Lead) {
        showLeadDialog(titleRes = R.string.edit_lead, existing = lead)
    }

    private fun showLeadDialog(titleRes: Int, existing: Lead?) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_add_lead, null)
        val nameField = dialogView.findViewById<TextInputEditText>(R.id.etLeadName)
        val phoneField = dialogView.findViewById<TextInputEditText>(R.id.etLeadPhone)
        val emailField = dialogView.findViewById<TextInputEditText>(R.id.etLeadEmail)
        val sourceField = dialogView.findViewById<TextInputEditText>(R.id.etLeadSource)
        val notesField = dialogView.findViewById<TextInputEditText>(R.id.etLeadNotes)
        val statusChips = dialogView.findViewById<ChipGroup>(R.id.leadStatusChips)
        val priorityChips = dialogView.findViewById<ChipGroup>(R.id.leadPriorityChips)

        var pickedStatus = existing?.status ?: "new"
        var pickedPriority = existing?.priority ?: "normal"

        buildChoiceChips(
            statusChips, R.array.lead_status_spinner, R.array.lead_status_values, pickedStatus
        ) { pickedStatus = it }
        buildChoiceChips(
            priorityChips, R.array.lead_priority_spinner, R.array.lead_priority_values, pickedPriority
        ) { pickedPriority = it }

        existing?.let {
            nameField.setText(it.name)
            phoneField.setText(it.phone)
            emailField.setText(it.email.orEmpty())
            sourceField.setText(it.source.orEmpty())
            notesField.setText(it.notes.orEmpty())
        }

        AlertDialog.Builder(requireContext())
            .setTitle(titleRes)
            .setView(dialogView)
            .setPositiveButton(R.string.save) { _, _ ->
                val name = nameField.text?.toString()?.trim().orEmpty()
                val phone = phoneField.text?.toString()?.trim().orEmpty()
                if (name.isEmpty() || phone.isEmpty()) {
                    Toast.makeText(
                        requireContext(),
                        if (name.isEmpty()) R.string.lead_name_required else R.string.lead_phone_required,
                        Toast.LENGTH_SHORT
                    ).show()
                    return@setPositiveButton
                }
                val lead = Lead(
                    id = existing?.id ?: 0,
                    name = name,
                    phone = phone,
                    email = emailField.text?.toString()?.trim()?.takeIf { it.isNotEmpty() },
                    status = pickedStatus,
                    source = sourceField.text?.toString()?.trim()?.takeIf { it.isNotEmpty() },
                    priority = pickedPriority,
                    notes = notesField.text?.toString()?.trim()?.takeIf { it.isNotEmpty() },
                    owner_id = existing?.owner_id ?: 0,
                    assigned_to = existing?.assigned_to,
                    last_contacted_at = existing?.last_contacted_at,
                    created_at = existing?.created_at.orEmpty(),
                    updated_at = existing?.updated_at.orEmpty()
                )
                if (existing == null) {
                    api?.createLead(lead)?.onSuccess {
                        refresh()
                        Toast.makeText(requireContext(), R.string.lead_saved, Toast.LENGTH_SHORT).show()
                    }?.onFailure { error -> toastError(error.message) }
                } else {
                    api?.updateLead(existing.id, lead)?.onSuccess {
                        refresh()
                        Toast.makeText(requireContext(), R.string.lead_updated, Toast.LENGTH_SHORT).show()
                    }?.onFailure { error -> toastError(error.message) }
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun buildChoiceChips(
        group: ChipGroup,
        labelArrayRes: Int,
        valueArrayRes: Int,
        selectedValue: String,
        onPicked: (String) -> Unit
    ) {
        val labels = resources.getStringArray(labelArrayRes)
        val values = resources.getStringArray(valueArrayRes)
        labels.forEachIndexed { index, label ->
            val chip = layoutInflater.inflate(R.layout.item_tag_chip, group, false) as Chip
            chip.text = label
            chip.isChecked = values.getOrNull(index) == selectedValue
            chip.setOnClickListener { onPicked(values.getOrNull(index).orEmpty()) }
            group.addView(chip)
        }
    }

    /** Quick actions on a lead row tap: call, mark contacted, edit. */
    private fun showLeadSheet(lead: Lead) {
        val items = arrayOf(
            getString(R.string.call_number),
            getString(R.string.mark_contacted),
            getString(R.string.edit_lead)
        )
        AlertDialog.Builder(requireContext())
            .setTitle(lead.name)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> placeCall(lead.phone)
                    1 -> api?.markLeadContacted(lead.id)?.onSuccess {
                        refresh()
                        Toast.makeText(requireContext(), R.string.marked_contacted, Toast.LENGTH_SHORT).show()
                    }?.onFailure { error -> toastError(error.message) }
                    2 -> showEditDialog(lead)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun toastError(message: String?) {
        Toast.makeText(requireContext(), message ?: getString(R.string.error_title), Toast.LENGTH_SHORT).show()
    }

    // ─── Adapter ───

    inner class LeadsAdapter(
        private val onCall: (Lead) -> Unit,
        private val onEdit: (Lead) -> Unit,
        private val onRowClick: (Lead) -> Unit
    ) : RecyclerView.Adapter<LeadsAdapter.Holder>() {

        private var items: List<Lead> = emptyList()

        fun submitList(list: List<Lead>) {
            items = list
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_lead, parent, false))

        override fun onBindViewHolder(holder: Holder, position: Int) = holder.bind(items[position], position)

        override fun getItemCount(): Int = items.size

        inner class Holder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val name: TextView = itemView.findViewById(R.id.tvLeadName)
            private val phone: TextView = itemView.findViewById(R.id.tvLeadPhone)
            private val status: TextView = itemView.findViewById(R.id.tvLeadStatus)
            private val priority: TextView = itemView.findViewById(R.id.tvLeadPriority)
            private val lastContact: TextView = itemView.findViewById(R.id.tvLastContact)
            private val divider: View = itemView.findViewById(R.id.leadDivider)

            fun bind(lead: Lead, position: Int) {
                val context = itemView.context
                name.text = lead.name
                phone.text = lead.phone
                status.text = lead.statusLabel
                priority.text = lead.priorityLabel
                lastContact.text = lead.last_contacted_at
                    ?.let { Fmt.relative(context, it) }
                    ?: getString(R.string.lead_never_contacted)

                val colorRes = when (lead.status.lowercase()) {
                    "new" -> R.color.info
                    "contacted", "qualified" -> R.color.accent
                    "converted", "won" -> R.color.success
                    "lost" -> R.color.danger
                    else -> R.color.text_secondary
                }
                status.setTextColor(ContextCompat.getColor(context, colorRes))

                Ui.applyDivider(divider, position, items.size)

                itemView.setOnClickListener { onRowClick(lead) }
                itemView.findViewById<ImageButton>(R.id.btnCallLead).setOnClickListener { onCall(lead) }
                itemView.findViewById<ImageButton>(R.id.btnEdit).setOnClickListener { onEdit(lead) }
            }
        }
    }

    companion object {
        /** Lowercased API values, index-aligned with R.array.lead_status_filter. */
        private val statusValues = listOf(null, "new", "contacted", "converted", "lost")

        fun newInstance() = LeadsFragment()
    }
}