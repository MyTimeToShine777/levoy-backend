package com.levoy.app.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.widget.doAfterTextChanged
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.levoy.app.MainActivity
import com.levoy.app.R
import com.levoy.app.model.CallEvent
import com.levoy.app.model.Tag
import com.levoy.app.network.ApiClient
import com.levoy.app.util.Contacts
import com.levoy.app.util.Fmt
import com.levoy.app.util.Ui
import com.levoy.app.util.Ui.hide
import com.levoy.app.util.Ui.show
import com.levoy.app.util.Ui.showIf
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.materialswitch.MaterialSwitch

/**
 * Call history.
 *
 * Filter composition, and which layer handles each one:
 *  - direction / status / date_from / date_to / phone -> real backend params
 *  - source (app), contact type (saved/unsaved), notes text, tags
 *      -> the backend has no query param for these, so they are applied to
 *         the page that was fetched. That is stated in the sheet's hint line.
 */
class CallsFragment : Fragment() {

    private var api: ApiClient? = null
    private var adapter: CallsAdapter? = null
    private var tags: List<Tag> = emptyList()

    private var currentPage = 1
    private val pageSize = 50

    private var phoneQuery: String? = null
    private var filters = CallFilters()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_calls, container, false)
        api = ApiClient(requireContext())

        val recycler = view.findViewById<RecyclerView>(R.id.recyclerCalls)
        recycler.layoutManager = LinearLayoutManager(context)
        adapter = CallsAdapter(
            onClick = { showCallDetail(it) },
            onPin = { togglePin(it) },
            onCall = { placeCall(it.phone_number) }
        )
        recycler.adapter = adapter

        view.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh).apply {
            setColorSchemeColors(requireContext().getColor(R.color.accent))
            setOnRefreshListener { refresh() }
        }

        val search = view.findViewById<EditText>(R.id.etSearchCalls)
        search.doAfterTextChanged { text ->
            phoneQuery = text?.toString()?.trim()?.takeIf { it.isNotEmpty() }
            currentPage = 1
            loadCalls()
        }

        view.findViewById<View>(R.id.btnFilters).setOnClickListener { showFilterSheet() }

        view.findViewById<View>(R.id.errorState).findViewById<View>(R.id.errorRetry)
            .setOnClickListener { refresh() }

        view.findViewById<MaterialButton>(R.id.btnPrevPage).setOnClickListener {
            if (currentPage > 1) { currentPage--; loadCalls() }
        }
        view.findViewById<MaterialButton>(R.id.btnNextPage).setOnClickListener {
            currentPage++; loadCalls()
        }

        return view
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        refresh()
        loadTags()
    }

    fun refresh() {
        currentPage = 1
        loadCalls()
    }

    private fun loadCalls() {
        val root = view ?: return
        val swipe = root.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh)
        val progress = root.findViewById<ProgressBar>(R.id.progressCalls)
        val emptyState = root.findViewById<View>(R.id.emptyState)
        val errorState = root.findViewById<View>(R.id.errorState)

        swipe.isRefreshing = true
        progress.show()
        errorState.hide()

        api?.getCalls(
            limit = pageSize,
            offset = (currentPage - 1) * pageSize,
            direction = filters.direction,
            status = filters.status,
            phone = phoneQuery,
            dateFrom = filters.dateFrom,
            dateTo = filters.dateTo
        )?.onSuccess { fetched ->
            if (view == null) return@onSuccess
            // App-side filters only; a page that filters down to nothing still
            // renders the "no match" empty state rather than looking broken.
            val filtered = applyClientSideFilters(fetched)
            adapter?.submitList(filtered)
            updatePagination(fetched.size)
            updateFilterBadge(root)
            bindSummary(root, fetched.size, filtered.size)
            Ui.hideBoth(emptyState, errorState)
            if (filtered.isEmpty()) showEmpty(root, fetched.isEmpty())
            swipe.isRefreshing = false
            progress.hide()
        }?.onFailure { error ->
            if (view == null) return@onFailure
            adapter?.submitList(emptyList())
            swipe.isRefreshing = false
            progress.hide()
            emptyState.hide()
            Ui.showErrorState(errorState, requireContext()) { refresh() }
            errorState.findViewById<TextView>(R.id.errorBody).text =
                getString(R.string.load_failed) + " " + (error.message ?: "")
        }
    }

    private fun showEmpty(root: View, serverReturnedNothing: Boolean) {
        val emptyState = root.findViewById<View>(R.id.emptyState)
        if (serverReturnedNothing && filters.isEmpty()) {
            Ui.showEmptyState(
                emptyState, R.drawable.ic_calls,
                R.string.empty_calls_title, R.string.empty_calls_body
            )
        } else {
            Ui.showEmptyState(
                emptyState, R.drawable.ic_filter,
                R.string.empty_calls_filtered_title, R.string.empty_calls_filtered_body,
                getString(R.string.reset)
            ) { resetFiltersAndReload(root) }
        }
        emptyState.show()
    }

    private fun resetFiltersAndReload(root: View) {
        filters = CallFilters()
        root.findViewById<EditText>(R.id.etSearchCalls).setText("")
        refresh()
    }

    private fun applyClientSideFilters(calls: List<CallEvent>): List<CallEvent> =
        calls.filter { call ->
            val sourceOk = when (filters.source) {
                CallSource.PHONE -> true // the provider does not record the source app
                CallSource.WHATSAPP -> call.sourceApp.equals("whatsapp", true)
                CallSource.OTHER_APP -> !call.sourceApp.isNullOrBlank() &&
                    !call.sourceApp.equals("whatsapp", true)
                null -> true
            }
            val contactOk = when (filters.contactType) {
                ContactType.SAVED -> call.isSavedContact
                ContactType.UNSAVED -> !call.isSavedContact
                null -> true
            }
            val notesOk = when {
                filters.hasNotesOnly && call.notes.isNullOrBlank() -> false
                !filters.notesQuery.isNullOrBlank() ->
                    call.notes?.contains(filters.notesQuery!!, ignoreCase = true) == true
                else -> true
            }
            val tagsOk = if (filters.tagIds.isEmpty()) true
                         else filters.tagIds.any { call.tags?.contains(it) == true }
            sourceOk && contactOk && notesOk && tagsOk
        }

    private fun bindSummary(root: View, fetched: Int, shown: Int) {
        val summary = root.findViewById<TextView>(R.id.tvResultSummary)
        summary.text = if (fetched == shown) {
            getString(R.string.filter_results_label, fetched.toString())
        } else {
            "$shown of $fetched " + getString(R.string.calls).lowercase()
        }
        summary.showIf(fetched > 0)
    }

    private fun updatePagination(pageCount: Int) {
        val root = view ?: return
        root.findViewById<TextView>(R.id.tvPageInfo).text =
            getString(R.string.page_info, currentPage, pageCount)
        root.findViewById<MaterialButton>(R.id.btnPrevPage).isEnabled = currentPage > 1
        root.findViewById<MaterialButton>(R.id.btnNextPage).isEnabled = pageCount == pageSize
    }

    private fun updateFilterBadge(root: View) {
        val badge = root.findViewById<TextView>(R.id.tvFilterBadge)
        val count = filters.activeCount()
        badge.text = count.toString()
        badge.showIf(count > 0)
    }

    // ─── Filter sheet ───

    private fun showFilterSheet() {
        val sheetView = layoutInflater.inflate(R.layout.sheet_call_filters, null)
        val dialog = BottomSheetDialog(requireContext())
        dialog.setContentView(sheetView)

        val durationChips = sheetView.findViewById<ChipGroup>(R.id.durationPresetChips)
        val sourceChips = sheetView.findViewById<ChipGroup>(R.id.sourceChips)
        val directionChips = sheetView.findViewById<ChipGroup>(R.id.directionChips)
        val statusChips = sheetView.findViewById<ChipGroup>(R.id.statusChips)
        val contactChips = sheetView.findViewById<ChipGroup>(R.id.contactTypeChips)
        val tagChips = sheetView.findViewById<ChipGroup>(R.id.tagChips)
        val notesField = sheetView.findViewById<EditText>(R.id.etFilterNotes)
        val notesSwitch = sheetView.findViewById<MaterialSwitch>(R.id.switchHasNotes)
        val activeCount = sheetView.findViewById<TextView>(R.id.tvFilterActiveCount)
        val customBlock = sheetView.findViewById<View>(R.id.customRangeBlock)
        val dateFromButton = sheetView.findViewById<MaterialButton>(R.id.btnDateFrom)
        val dateToButton = sheetView.findViewById<MaterialButton>(R.id.btnDateTo)

        // Draft state: edits stay local until Done.
        var draft = filters.copy()
        val customFrom = draft.customFrom
        val customTo = draft.customTo


        buildChips(durationChips, R.array.call_duration_presets, draft.durationPresetIndex) { index, _ ->
            draft = draft.copy(durationPresetIndex = index)
            customBlock.showIf(index == DURATION_CUSTOM)
            refreshActiveCount(draft, activeCount)
        }
        buildChips(sourceChips, R.array.call_source_filter, draft.sourceIndex) { index, _ ->
            draft = draft.copy(sourceIndex = index)
            refreshActiveCount(draft, activeCount)
        }
        buildChips(directionChips, R.array.call_direction_filter, draft.directionIndex) { index, _ ->
            draft = draft.copy(directionIndex = index)
            refreshActiveCount(draft, activeCount)
        }
        buildChips(statusChips, R.array.call_status_filter, draft.statusIndex) { index, _ ->
            draft = draft.copy(statusIndex = index)
            refreshActiveCount(draft, activeCount)
        }
        buildChips(contactChips, R.array.call_contact_type_filter, draft.contactTypeIndex) { index, _ ->
            draft = draft.copy(contactTypeIndex = index)
            refreshActiveCount(draft, activeCount)
        }

        // Tags are multi-select.
        if (tags.isEmpty()) {
            sheetView.findViewById<TextView>(R.id.tvTagsEmpty).show()
            tagChips.hide()
        } else {
            tags.forEach { tag ->
                val chip = layoutInflater.inflate(R.layout.item_tag_chip, tagChips, false) as Chip
                chip.text = tag.name
                chip.isChecked = draft.tagIds.contains(tag.id)
                chip.setOnCheckedChangeListener { _, checked ->
                    val updated = draft.tagIds.toMutableSet()
                    if (checked) updated.add(tag.id) else updated.remove(tag.id)
                    draft = draft.copy(tagIds = updated)
                    refreshActiveCount(draft, activeCount)
                }
                tagChips.addView(chip)
            }
        }

        notesField.setText(draft.notesQuery.orEmpty())
        notesField.doAfterTextChanged { draft = draft.copy(notesQuery = it?.toString()) }
        notesSwitch.isChecked = draft.hasNotesOnly
        notesSwitch.setOnCheckedChangeListener { _, checked ->
            draft = draft.copy(hasNotesOnly = checked)
            refreshActiveCount(draft, activeCount)
        }

        // Custom range
        customBlock.showIf(draft.durationPresetIndex == DURATION_CUSTOM)
        dateFromButton.text = customFrom?.let { Fmt.isoDate(it) } ?: getString(R.string.filter_custom_from)
        dateToButton.text = customTo?.let { Fmt.isoDate(it) } ?: getString(R.string.filter_custom_to)

        dateFromButton.setOnClickListener {
            pickDate(getString(R.string.filter_custom_from)) { picked ->
                draft = draft.copy(customFrom = picked)
                dateFromButton.text = Fmt.isoDate(picked)
                refreshActiveCount(draft, activeCount)
            }
        }
        dateToButton.setOnClickListener {
            pickDate(getString(R.string.filter_custom_to)) { picked ->
                draft = draft.copy(customTo = picked)
                dateToButton.text = Fmt.isoDate(picked)
                refreshActiveCount(draft, activeCount)
            }
        }

        refreshActiveCount(draft, activeCount)

        sheetView.findViewById<MaterialButton>(R.id.btnResetFilters).setOnClickListener {
            filters = CallFilters()
            dialog.dismiss()
            resetFiltersAndReload(view ?: return@setOnClickListener)
        }
        sheetView.findViewById<MaterialButton>(R.id.btnApplyFilters).setOnClickListener {
            filters = draft
            dialog.dismiss()
            currentPage = 1
            loadCalls()
        }

        dialog.show()
    }

    private fun refreshActiveCount(draft: CallFilters, label: TextView) {
        val count = draft.activeCount()
        label.text = count.toString()
        label.showIf(count > 0)
    }

    private fun buildChips(
        group: ChipGroup,
        arrayRes: Int,
        checkedIndex: Int,
        onSelected: (index: Int, label: String) -> Unit
    ) {
        val labels = resources.getStringArray(arrayRes)
        labels.forEachIndexed { index, label ->
            val chip = layoutInflater.inflate(R.layout.item_tag_chip, group, false) as Chip
            chip.text = label
            chip.isChecked = index == checkedIndex
            chip.setOnClickListener { onSelected(index, label) }
            group.addView(chip)
        }
    }

    private fun pickDate(title: String, onPicked: (java.util.Date) -> Unit) {
        val now = java.util.Calendar.getInstance()
        android.app.DatePickerDialog(
            requireContext(),
            { _, year, month, day ->
                val cal = java.util.Calendar.getInstance()
                cal.set(year, month, day)
                onPicked(cal.time)
            },
            now.get(java.util.Calendar.YEAR),
            now.get(java.util.Calendar.MONTH),
            now.get(java.util.Calendar.DAY_OF_MONTH)
        ).apply { setTitle(title) }.show()
    }

    private fun loadTags() {
        api?.getTags()?.onSuccess { loaded ->
            if (view != null) tags = loaded
        }
    }

    // ─── Row actions ───

    private fun togglePin(call: CallEvent) {
        val target = !call.is_pinned
        api?.togglePin(call.id, target)?.onSuccess {
            adapter?.replace(call.copy(is_pinned = target))
            view?.let { updateFilterBadge(it) }
        }?.onFailure {
            view?.let { root ->
                android.widget.Toast.makeText(root.context, R.string.pin_failed, android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun placeCall(number: String) {
        val intent = android.content.Intent(
            android.content.Intent.ACTION_DIAL,
            android.net.Uri.parse("tel:$number")
        )
        runCatching { startActivity(intent) }.onFailure {
            android.widget.Toast.makeText(requireContext(), R.string.no_app_handles_call, android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    private fun showCallDetail(call: CallEvent) {
        val sheetView = layoutInflater.inflate(R.layout.sheet_call_detail, null)
        val dialog = BottomSheetDialog(requireContext())
        dialog.setContentView(sheetView)
        val context = requireContext()

        val incoming = call.direction.equals("incoming", true)
        sheetView.findViewById<ImageView>(R.id.ivDetailDirection).apply {
            setImageResource(if (incoming) R.drawable.ic_incoming else R.drawable.ic_outgoing)
            setColorFilter(context.getColor(if (incoming) R.color.success else R.color.info))
        }
        sheetView.findViewById<TextView>(R.id.tvDetailName).text = call.displayName
        sheetView.findViewById<TextView>(R.id.tvDetailNumber).text = call.phone_number
        sheetView.findViewById<TextView>(R.id.tvDetailTime).text = Fmt.dateTime(context, call.timestamp)
        sheetView.findViewById<TextView>(R.id.tvDetailStatus).text = call.statusLabel
        sheetView.findViewById<TextView>(R.id.tvDetailDuration).text = Fmt.duration(call.duration_seconds)
        sheetView.findViewById<TextView>(R.id.tvDetailDirection).text = call.directionLabel

        val notesField = sheetView.findViewById<EditText>(R.id.etDetailNotes)
        notesField.setText(call.notes.orEmpty())

        val pinButton = sheetView.findViewById<MaterialButton>(R.id.btnDetailPin)
        pinButton.setText(if (call.is_pinned) R.string.unpin_call else R.string.pin_call)
        pinButton.setOnClickListener {
            val target = !call.is_pinned
            api?.togglePin(call.id, target)?.onSuccess {
                adapter?.replace(call.copy(is_pinned = target))
                pinButton.setText(if (target) R.string.unpin_call else R.string.pin_call)
            }
        }

        sheetView.findViewById<MaterialButton>(R.id.btnDetailCall).setOnClickListener {
            dialog.dismiss()
            placeCall(call.phone_number)
        }

        // The in-app twin of the Quick Action overlay's Save Contact. This path
        // always has an Activity, so unlike the overlay it is not subject to
        // Android 10+ background-activity-start restrictions.
        val saveContactButton = sheetView.findViewById<MaterialButton>(R.id.btnDetailSaveContact)
        val alreadySaved = call.isSavedContact || Contacts.isSaved(context, call.phone_number)
        saveContactButton.isEnabled = !alreadySaved
        saveContactButton.alpha = if (alreadySaved) 0.5f else 1f
        saveContactButton.setOnClickListener {
            Contacts.requestSave(context, call.phone_number)
            dialog.dismiss()
        }
        sheetView.findViewById<MaterialButton>(R.id.btnDetailSaveNotes).setOnClickListener {
            val notes = notesField.text.toString().trim()
            api?.updateCallNotes(call.id, notes)?.onSuccess {
                adapter?.replace(call.copy(notes = notes.takeIf { it.isNotEmpty() }))
                android.widget.Toast.makeText(context, R.string.notes_saved, android.widget.Toast.LENGTH_SHORT).show()
                dialog.dismiss()
            }?.onFailure {
                android.widget.Toast.makeText(context, R.string.pin_failed, android.widget.Toast.LENGTH_SHORT).show()
            }
        }

        dialog.show()
    }

    // ─── Adapter ───

    inner class CallsAdapter(
        private val onClick: (CallEvent) -> Unit,
        private val onPin: (CallEvent) -> Unit,
        private val onCall: (CallEvent) -> Unit
    ) : RecyclerView.Adapter<CallsAdapter.Holder>() {

        private var items: List<CallEvent> = emptyList()

        fun submitList(list: List<CallEvent>) {
            items = list
            notifyDataSetChanged()
        }

        /** Single-row optimistic update after pin / notes. */
        fun replace(call: CallEvent) {
            val index = items.indexOfFirst { it.id == call.id }
            if (index < 0) return
            items = items.toMutableList().also { it[index] = call }
            notifyItemChanged(index)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val row = LayoutInflater.from(parent.context).inflate(R.layout.item_call, parent, false)
            return Holder(row)
        }

        override fun onBindViewHolder(holder: Holder, position: Int) = holder.bind(items[position], position)

        override fun getItemCount(): Int = items.size

        inner class Holder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val contact: TextView = itemView.findViewById(R.id.tvContact)
            private val status: TextView = itemView.findViewById(R.id.tvStatus)
            private val direction: TextView = itemView.findViewById(R.id.tvDirection)
            private val time: TextView = itemView.findViewById(R.id.tvTime)
            private val duration: TextView = itemView.findViewById(R.id.tvDuration)
            private val icon: ImageView = itemView.findViewById(R.id.ivDirection)
            private val metaRow: View = itemView.findViewById(R.id.callMetaRow)
            private val pinnedBadge: TextView = itemView.findViewById(R.id.tvPinnedBadge)
            private val notePreview: TextView = itemView.findViewById(R.id.tvNotePreview)
            private val divider: View = itemView.findViewById(R.id.callDivider)

            fun bind(call: CallEvent, position: Int) {
                val context = itemView.context
                contact.text = call.displayName
                status.text = call.statusLabel
                direction.text = call.directionLabel
                time.text = Fmt.dateTime(context, call.timestamp)
                duration.text = Fmt.duration(call.duration_seconds)

                val incoming = call.direction.equals("incoming", true)
                icon.setImageResource(if (incoming) R.drawable.ic_incoming else R.drawable.ic_outgoing)
                icon.setColorFilter(context.getColor(if (incoming) R.color.success else R.color.info))

                status.setTextColor(
                    context.getColor(
                        when (call.status.lowercase()) {
                            "connected" -> R.color.success
                            "missed", "rejected" -> R.color.danger
                            else -> R.color.warning
                        }
                    )
                )

                pinnedBadge.showIf(call.is_pinned)
                val notes = call.notes?.takeIf { it.isNotBlank() }
                notePreview.text = notes
                notePreview.showIf(notes != null)
                metaRow.showIf(call.is_pinned || notes != null)

                Ui.applyDivider(divider, position, items.size)

                itemView.setOnClickListener { onClick(call) }
                itemView.setOnLongClickListener {
                    onPin(call)
                    true
                }
                duration.setOnClickListener { onCall(call) }
            }
        }
    }

    companion object {
        const val DURATION_CUSTOM = 4

        fun newInstance() = CallsFragment()
    }
}

// ─── Filter state ───

enum class CallSource { PHONE, WHATSAPP, OTHER_APP }
enum class ContactType { SAVED, UNSAVED }

/**
 * Immutable snapshot of the filter sheet. Index 0 is always the "All" option
 * for every single-select chip, so index 0 means "no constraint".
 */
data class CallFilters(
    val durationPresetIndex: Int = 0,
    val sourceIndex: Int = 0,
    val directionIndex: Int = 0,
    val statusIndex: Int = 0,
    val contactTypeIndex: Int = 0,
    val notesQuery: String? = null,
    val hasNotesOnly: Boolean = false,
    val tagIds: Set<Int> = emptySet(),
    val customFrom: java.util.Date? = null,
    val customTo: java.util.Date? = null
) {

    val direction: String?
        get() = when (directionIndex) {
            1 -> "incoming"
            2 -> "outgoing"
            else -> null
        }

    val status: String?
        get() = when (statusIndex) {
            1 -> "connected"
            2 -> "missed"
            3 -> "rejected"
            4 -> "no_answer"
            else -> null
        }

    val source: CallSource?
        get() = when (sourceIndex) {
            1 -> CallSource.PHONE
            2 -> CallSource.WHATSAPP
            3 -> CallSource.OTHER_APP
            else -> null
        }

    val contactType: ContactType?
        get() = when (contactTypeIndex) {
            1 -> ContactType.SAVED
            2 -> ContactType.UNSAVED
            else -> null
        }

    /**
     * Resolves the duration preset into the backend's date_from / date_to.
     * "All Time" (index 0) and any unset custom bound send no param at all.
     */
    val dateFrom: String?
        get() = when (durationPresetIndex) {
            1 -> Fmt.isoDate(startOfToday())
            2 -> Fmt.isoDate(daysAgo(7))
            3 -> Fmt.isoDate(daysAgo(30))
            DURATION_CUSTOM_INDEX -> customFrom?.let { Fmt.isoDate(it) }
            else -> null
        }

    val dateTo: String?
        get() = when (durationPresetIndex) {
            DURATION_CUSTOM_INDEX -> customTo?.let { Fmt.isoDate(it) }
            else -> null
        }

    fun isEmpty(): Boolean = activeCount() == 0

    fun activeCount(): Int {
        var count = 0
        if (durationPresetIndex != 0) count++
        if (sourceIndex != 0) count++
        if (directionIndex != 0) count++
        if (statusIndex != 0) count++
        if (contactTypeIndex != 0) count++
        if (hasNotesOnly) count++
        if (!notesQuery.isNullOrBlank()) count++
        if (tagIds.isNotEmpty()) count++
        return count
    }

    private fun daysAgo(days: Int): java.util.Date {
        val cal = java.util.Calendar.getInstance()
        cal.add(java.util.Calendar.DAY_OF_YEAR, -days)
        return cal.time
    }

    private fun startOfToday(): java.util.Date {
        val cal = java.util.Calendar.getInstance()
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0)
        cal.set(java.util.Calendar.MINUTE, 0)
        cal.set(java.util.Calendar.SECOND, 0)
        cal.set(java.util.Calendar.MILLISECOND, 0)
        return cal.time
    }

    private companion object {
        const val DURATION_CUSTOM_INDEX = 4
    }
}