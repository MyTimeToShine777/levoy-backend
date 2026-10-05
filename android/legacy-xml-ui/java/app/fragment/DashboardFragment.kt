package com.levoy.app.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.levoy.app.MainActivity
import com.levoy.app.R
import com.levoy.app.model.CallEvent
import com.levoy.app.model.DashboardStats
import com.levoy.app.model.Lead
import com.levoy.app.network.ApiClient
import com.levoy.app.util.Fmt
import com.levoy.app.util.Ui
import com.levoy.app.util.Ui.hide
import com.levoy.app.util.Ui.show
import java.util.Calendar

/**
 * Home screen: a greeting, a 2x3 grid of stat cards (value + delta/hint line),
 * a pipeline breakdown and the five most recent calls.
 *
 * /api/calls/stats is scoped to the calling user, so "Today" here is this
 * agent's own activity — which is what the reference dashboard shows too.
 */
class DashboardFragment : Fragment() {

    private var api: ApiClient? = null
    private var stats: DashboardStats? = null
    private var recentCalls: List<CallEvent> = emptyList()
    private var leads: List<Lead> = emptyList()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_dashboard, container, false)
        api = ApiClient(requireContext())

        view.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh).apply {
            setColorSchemeColors(requireContext().getColor(R.color.accent))
            setOnRefreshListener { refresh() }
        }

        view.findViewById<View>(R.id.errorState).findViewById<View>(R.id.errorRetry)
            .setOnClickListener { refresh() }

        return view
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        bindGreeting(view)
        refresh()
    }

    fun refresh() {
        val root = view ?: return
        val swipe = root.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh)
        val content = root.findViewById<View>(R.id.dashboardContent)
        val errorState = root.findViewById<View>(R.id.errorState)

        swipe.isRefreshing = true
        errorState.hide()

        api?.getStats()
            ?.onSuccess { loaded ->
                stats = loaded
                bindStats(root, loaded)
                loadSecondary(root, swipe, content)
            }
            ?.onFailure { error ->
                swipe.isRefreshing = false
                content.hide()
                Ui.showErrorState(errorState, requireContext()) { refresh() }
                errorState.findViewById<TextView>(R.id.errorBody).text =
                    getString(R.string.error_body) + " " + (error.message ?: "")
            }
    }

    /** Recent calls and the pipeline are secondary: a failure here must not
     *  wipe out stats that already rendered. */
    private fun loadSecondary(root: View, swipe: SwipeRefreshLayout, content: View) {
        api?.getCalls(limit = 5)?.onSuccess { calls ->
            if (view == null) return@onSuccess
            recentCalls = calls
            bindRecentCalls(root, calls)
            loadPipeline(root)
        }?.onFailure {
            if (view != null) loadPipeline(root)
        }
        swipe.isRefreshing = false
        content.show()
    }

    private fun loadPipeline(root: View) {
        api?.getLeads(limit = 200)?.onSuccess { list ->
            if (view == null) return@onSuccess
            leads = list
            bindPipeline(root, list)
        }
    }

    // ─── Binding ───

    private fun bindGreeting(root: View) {
        val name = (activity as? MainActivity)?.currentUserName() ?: getString(R.string.app_name)
        root.findViewById<TextView>(R.id.tvGreeting).text = greeting() + ", " + name.substringBefore(" ")
        root.findViewById<TextView>(R.id.tvGreetingSub).text =
            getString(R.string.dash_today) + " · " + Fmt.clock(requireContext(), isoNow())
    }

    private fun bindStats(root: View, s: DashboardStats) {
        val context = requireContext()

        Ui.bindStatCard(
            root.findViewById(R.id.statCallsToday), R.string.dash_calls_today,
            s.total_calls_today.toString(),
            "${s.incoming_today} in / ${s.outgoing_today} out"
        )
        Ui.bindStatCard(
            root.findViewById(R.id.statConnected), R.string.dash_connected,
            s.connected_today.toString(),
            getString(R.string.dash_connect_rate) + " " + s.connectRate + "%"
        )
        Ui.bindStatCard(
            root.findViewById(R.id.statMissed), R.string.dash_missed,
            s.missed_today.toString(),
            getString(R.string.dash_rejected) + " " + s.rejected_today
        )
        Ui.bindStatCard(
            root.findViewById(R.id.statAvgDuration), R.string.dash_avg_duration,
            Fmt.avgDuration(s.avg_call_duration),
            getString(R.string.perf_avg_duration)
        )
        Ui.bindStatCard(
            root.findViewById(R.id.statTalkTime), R.string.dash_talk_time,
            Fmt.talkTime(s.total_duration_today),
            s.unique_contacts_today.toString() + " " +
                context.getString(R.string.report_table_contacts).lowercase()
        )
        Ui.bindStatCard(
            root.findViewById(R.id.statConnectRate), R.string.dash_connect_rate,
            s.connectRate + "%",
            "${s.total_calls_all} " + context.getString(R.string.dash_calls_today).lowercase()
        )
    }

    private fun bindPipeline(root: View, list: List<Lead>) {
        val container = root.findViewById<LinearLayout>(R.id.pipelineContainer)
        val emptyLabel = root.findViewById<TextView>(R.id.tvPipelineEmpty)
        val card = root.findViewById<View>(R.id.pipelineCard)

        Ui.bindSectionHeader(
            root.findViewById(R.id.pipelineHeader),
            R.string.dash_today,
            getString(R.string.dash_pipeline),
            getString(R.string.dash_view_all)
        ) { (activity as? MainActivity)?.openSecondary(
            LeadsFragment.newInstance(), R.string.leads
        ) }

        container.removeAllViews()

        val stages = listOf("new", "contacted", "qualified", "proposal", "converted", "lost")
        val counts = stages.associateWith { stage -> list.count { it.status.equals(stage, true) } }
        val max = counts.values.maxOrNull() ?: 0

        if (max == 0) {
            card.hide()
            emptyLabel.show()
            return
        }
        card.show()
        emptyLabel.hide()

        stages.forEach { stage ->
            val count = counts[stage] ?: 0
            if (count == 0 && stage !in setOf("new", "converted")) return@forEach
            val row = layoutInflater.inflate(R.layout.item_metric_bar, container, false)
            val label = stage.replaceFirstChar { it.uppercase() }
            row.findViewById<TextView>(R.id.metricLabel).text = label
            row.findViewById<TextView>(R.id.metricValue).text = count.toString()
            val bar = row.findViewById<ProgressBar>(R.id.metricBar)
            bar.max = max
            bar.progress = count
            container.addView(row)
        }
    }

    private fun bindRecentCalls(root: View, calls: List<CallEvent>) {
        val container = root.findViewById<LinearLayout>(R.id.recentCallsContainer)
        val card = root.findViewById<View>(R.id.recentCallsCard)
        val emptyLabel = root.findViewById<TextView>(R.id.tvRecentCallsEmpty)

        Ui.bindSectionHeader(
            root.findViewById(R.id.recentCallsHeader),
            R.string.dash_today,
            getString(R.string.dash_recent_calls),
            getString(R.string.dash_view_all)
        ) { (activity as? MainActivity)?.openTabCalls() }

        container.removeAllViews()

        if (calls.isEmpty()) {
            card.hide()
            emptyLabel.show()
            return
        }
        card.show()
        emptyLabel.hide()

        val context = requireContext()
        calls.forEach { call ->
            val row = layoutInflater.inflate(R.layout.item_call, container, false)
            row.findViewById<TextView>(R.id.tvContact).text = call.displayName
            row.findViewById<TextView>(R.id.tvStatus).text = call.statusLabel
            row.findViewById<TextView>(R.id.tvDirection).text = call.directionLabel
            row.findViewById<TextView>(R.id.tvTime).text = Fmt.dateTime(context, call.timestamp)
            row.findViewById<TextView>(R.id.tvDuration).text = Fmt.duration(call.duration_seconds)

            val icon = row.findViewById<ImageView>(R.id.ivDirection)
            val incoming = call.direction.equals("incoming", true)
            icon.setImageResource(if (incoming) R.drawable.ic_incoming else R.drawable.ic_outgoing)
            icon.setColorFilter(
                context.getColor(if (incoming) R.color.success else R.color.info)
            )

            val statusView = row.findViewById<TextView>(R.id.tvStatus)
            statusView.setTextColor(
                context.getColor(
                    when (call.status.lowercase()) {
                        "connected" -> R.color.success
                        "missed", "rejected" -> R.color.danger
                        else -> R.color.warning
                    }
                )
            )

            // The dashboard preview is not interactive; drop the divider logic
            // and the meta row so the row stays compact.
            row.findViewById<View>(R.id.callMetaRow).hide()
            row.findViewById<View>(R.id.callDivider).hide()
            container.addView(row)
        }
    }

    private fun greeting(): String {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return when {
            hour < 12 -> getString(R.string.greeting_morning)
            hour < 18 -> getString(R.string.greeting_afternoon)
            else -> getString(R.string.greeting_evening)
        }
    }

    private fun isoNow(): String = Fmt.isoDateTime(java.util.Date())

    companion object {
        fun newInstance() = DashboardFragment()
    }
}