package com.levoy.app.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.levoy.app.R
import com.levoy.app.model.DailyReportData
import com.levoy.app.network.ApiClient
import com.levoy.app.util.Fmt
import com.levoy.app.util.Ui
import com.levoy.app.util.Ui.hide
import com.levoy.app.util.Ui.show
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup

/** Daily call totals with a 7 / 14 / 30 day range and a summary card row. */
class ReportsFragment : Fragment() {

    private var api: ApiClient? = null
    private var adapter: ReportsAdapter? = null
    private var days = 7

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_reports, container, false)
        api = ApiClient(requireContext())

        val recycler = view.findViewById<RecyclerView>(R.id.recyclerReports)
        recycler.layoutManager = LinearLayoutManager(context)
        adapter = ReportsAdapter()
        recycler.adapter = adapter

        view.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh).apply {
            setColorSchemeColors(requireContext().getColor(R.color.accent))
            setOnRefreshListener { refresh() }
        }

        buildRangeChips(view.findViewById(R.id.reportRangeChips))

        view.findViewById<MaterialButton>(R.id.btnGenerateReport).setOnClickListener {
            AlertDialog.Builder(requireContext())
                .setMessage(R.string.generate_report_confirm)
                .setPositiveButton(R.string.generate_report) { _, _ -> generate() }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
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

        api?.getDailyReports(days = days)?.onSuccess { reports ->
            if (view == null) return@onSuccess
            adapter?.submitList(reports)
            bindSummary(root, reports)
            Ui.hideBoth(emptyState, errorState)
            if (reports.isEmpty()) {
                Ui.showEmptyState(
                    emptyState, R.drawable.ic_reports,
                    R.string.empty_reports_title, R.string.empty_reports_body
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
                getString(R.string.reports_load_failed) + " " + (error.message ?: "")
        }
    }

    private fun buildRangeChips(group: ChipGroup) {
        val labels = resources.getStringArray(R.array.report_range_labels)
        val values = resources.getStringArray(R.array.report_range_days)
        labels.forEachIndexed { index, label ->
            val chip = layoutInflater.inflate(R.layout.item_tag_chip, group, false) as Chip
            chip.text = label
            chip.isChecked = index == 0
            chip.setOnClickListener {
                days = values.getOrNull(index)?.toIntOrNull() ?: 7
                refresh()
            }
            group.addView(chip)
        }
    }

    private fun bindSummary(root: View, reports: List<DailyReportData>) {
        val total = reports.sumOf { it.total_calls }
        val missed = reports.sumOf { it.missed }
        // A day can report more rejections than total calls if rows were
        // backfilled, so the derived connect rate is clamped rather than
        // allowed to render as a negative percentage.
        val connected = (reports.sumOf { it.total_calls } -
            reports.sumOf { it.missed + it.rejected }).coerceAtLeast(0)
        val totalSeconds = reports.sumOf { it.total_duration }
        val avgSeconds = if (total > 0) totalSeconds / total else 0
        val connectRate = if (total > 0) (connected * 100 / total).coerceIn(0, 100) else 0

        Ui.bindStatCard(
            root.findViewById(R.id.statReportCalls), R.string.report_total_calls,
            total.toString(),
            getString(R.string.report_days_format, days)
        )
        Ui.bindStatCard(
            root.findViewById(R.id.statReportMissed), R.string.report_missed,
            missed.toString(),
            reports.sumOf { it.rejected }.toString() + " " +
                getString(R.string.call_rejected).lowercase()
        )
        Ui.bindStatCard(
            root.findViewById(R.id.statReportConnect), R.string.report_connect_rate,
            connectRate + "%",
            Fmt.talkTime(avgSeconds) + " " + getString(R.string.dash_avg_duration).lowercase()
        )

        Ui.bindSectionHeader(
            root.findViewById(R.id.reportHeader),
            R.string.reports,
            getString(R.string.report_days_format, days)
        )
    }

    private fun generate() {
        api?.generateReport()?.onSuccess {
            Toast.makeText(requireContext(), R.string.report_generated, Toast.LENGTH_SHORT).show()
        }?.onFailure { error ->
            Toast.makeText(
                requireContext(),
                error.message ?: getString(R.string.error_title),
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    inner class ReportsAdapter : RecyclerView.Adapter<ReportsAdapter.Holder>() {

        private var items: List<DailyReportData> = emptyList()

        fun submitList(list: List<DailyReportData>) {
            items = list
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_report, parent, false))

        override fun onBindViewHolder(holder: Holder, position: Int) = holder.bind(items[position], position)

        override fun getItemCount(): Int = items.size

        inner class Holder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val date: TextView = itemView.findViewById(R.id.tvReportDate)
            private val total: TextView = itemView.findViewById(R.id.tvReportTotal)
            private val incoming: TextView = itemView.findViewById(R.id.tvReportIncoming)
            private val outgoing: TextView = itemView.findViewById(R.id.tvReportOutgoing)
            private val missed: TextView = itemView.findViewById(R.id.tvReportMissed)
            private val rejected: TextView = itemView.findViewById(R.id.tvReportRejected)
            private val duration: TextView = itemView.findViewById(R.id.tvReportDuration)
            private val unique: TextView = itemView.findViewById(R.id.tvReportUnique)
            private val divider: View = itemView.findViewById(R.id.reportDivider)

            fun bind(report: DailyReportData, position: Int) {
                val context = itemView.context
                date.text = Fmt.dayLabel(report.date)
                total.text = getString(R.string.report_total_calls) + ": " + report.total_calls
                incoming.text = getString(R.string.report_table_in) + ": " + report.incoming
                outgoing.text = getString(R.string.report_table_out) + ": " + report.outgoing
                missed.text = getString(R.string.report_table_missed) + ": " + report.missed
                rejected.text = getString(R.string.call_rejected) + ": " + report.rejected
                duration.text = getString(R.string.report_table_time) + ": " + Fmt.talkTime(report.total_duration)
                unique.text = getString(R.string.report_table_contacts) + ": " + report.unique_contacts
                Ui.applyDivider(divider, position, items.size)
            }
        }
    }

    companion object {
        fun newInstance() = ReportsFragment()
    }
}