package com.levoy.app.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.levoy.app.MainActivity
import com.levoy.app.R
import com.levoy.app.model.AgentPerformance
import com.levoy.app.model.LeaderboardEntry
import com.levoy.app.network.ApiClient
import com.levoy.app.util.Fmt
import com.levoy.app.util.Ui
import com.levoy.app.util.Ui.hide

/**
 * Two views over one screen:
 *
 *  MODE_PERFORMANCE — GET /api/agents/performance, the agent table with the
 *                     30d-vs-prior-30d delta line per agent.
 *  MODE_LEADERBOARD — GET /api/quality/leaderboard, ranked by QA score.
 *
 * Both hand off to QualityFragment on row tap, which is the per-category QA
 * deep dive. Only managers/admins reach this screen (MoreSheet gates it).
 */
class PerformanceFragment : Fragment() {

    private var api: ApiClient? = null
    private var performanceAdapter: PerformanceAdapter? = null
    private var leaderboardAdapter: LeaderboardAdapter? = null
    private var mode = MODE_PERFORMANCE

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_performance, container, false)
        api = ApiClient(requireContext())

        val recycler = view.findViewById<RecyclerView>(R.id.recyclerPerformance)
        recycler.layoutManager = LinearLayoutManager(context)

        performanceAdapter = PerformanceAdapter { agentId ->
            (activity as? MainActivity)?.openQuality(agentId)
        }
        leaderboardAdapter = LeaderboardAdapter { agentId ->
            (activity as? MainActivity)?.openQuality(agentId)
        }
        recycler.adapter = if (mode == MODE_LEADERBOARD) leaderboardAdapter else performanceAdapter

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
        refresh()
    }

    fun refresh() {
        val root = view ?: return
        val swipe = root.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh)
        val emptyState = root.findViewById<View>(R.id.emptyState)
        val errorState = root.findViewById<View>(R.id.errorState)

        swipe.isRefreshing = true
        errorState.hide()

        if (mode == MODE_LEADERBOARD) loadLeaderboard(swipe, emptyState, errorState)
        else loadPerformance(swipe, emptyState, errorState)
    }

    private fun loadPerformance(
        swipe: SwipeRefreshLayout,
        emptyState: View,
        errorState: View
    ) {
        api?.getAgentPerformance(days = 30)
            ?.onSuccess { response ->
                if (view == null) return@onSuccess
                // Agents with no activity at all are noise in a performance table.
                val agents = response.agents.filter { it.total_calls > 0 || it.total_leads > 0 }
                performanceAdapter?.submitList(agents)
                Ui.hideBoth(emptyState, errorState)
                if (agents.isEmpty()) {
                    Ui.showEmptyState(
                        emptyState, R.drawable.ic_performance,
                        R.string.empty_performance_title, R.string.empty_performance_body
                    )
                }
                swipe.isRefreshing = false
            }
            ?.onFailure { error ->
                if (view == null) return@onFailure
                swipe.isRefreshing = false
                performanceAdapter?.submitList(emptyList())
                emptyState.hide()
                Ui.showErrorState(errorState, requireContext()) { refresh() }
                errorState.findViewById<TextView>(R.id.errorBody).text =
                    (error.message ?: "") + " " + getString(R.string.perf_admin_only)
            }
    }

    private fun loadLeaderboard(
        swipe: SwipeRefreshLayout,
        emptyState: View,
        errorState: View
    ) {
        api?.getLeaderboard()
            ?.onSuccess { response ->
                if (view == null) return@onSuccess
                val reviewed = response.leaderboard.filter { it.review_count > 0 }
                leaderboardAdapter?.submitList(reviewed)
                Ui.hideBoth(emptyState, errorState)
                if (reviewed.isEmpty()) {
                    Ui.showEmptyState(
                        emptyState, R.drawable.ic_quality,
                        R.string.empty_quality_title, R.string.empty_quality_body
                    )
                }
                swipe.isRefreshing = false
            }
            ?.onFailure { error ->
                if (view == null) return@onFailure
                swipe.isRefreshing = false
                leaderboardAdapter?.submitList(emptyList())
                emptyState.hide()
                Ui.showErrorState(errorState, requireContext()) { refresh() }
                errorState.findViewById<TextView>(R.id.errorBody).text =
                    (error.message ?: "") + " " + getString(R.string.perf_admin_only)
            }
    }

    // ─── Adapters ───

    inner class PerformanceAdapter(
        private val onClick: (Int) -> Unit
    ) : RecyclerView.Adapter<PerformanceAdapter.Holder>() {

        private var items: List<AgentPerformance> = emptyList()

        fun submitList(list: List<AgentPerformance>) {
            items = list
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_performance, parent, false))

        override fun onBindViewHolder(holder: Holder, position: Int) = holder.bind(items[position], position)

        override fun getItemCount(): Int = items.size

        inner class Holder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val initials: TextView = itemView.findViewById(R.id.tvAgentInitials)
            private val name: TextView = itemView.findViewById(R.id.tvAgentName)
            private val email: TextView = itemView.findViewById(R.id.tvAgentEmail)
            private val delta: TextView = itemView.findViewById(R.id.tvAgentDelta)
            private val score: TextView = itemView.findViewById(R.id.tvAgentQaScore)
            private val reviews: TextView = itemView.findViewById(R.id.tvAgentReviews)
            private val calls: TextView = itemView.findViewById(R.id.tvAgentCalls)
            private val leads: TextView = itemView.findViewById(R.id.tvAgentLeads)
            private val connect: TextView = itemView.findViewById(R.id.tvAgentConnectRate)
            private val conversion: TextView = itemView.findViewById(R.id.tvAgentConversion)
            private val divider: View = itemView.findViewById(R.id.performanceDivider)

            fun bind(agent: AgentPerformance, position: Int) {
                val context = itemView.context
                initials.text = agent.initials
                name.text = agent.name
                email.text = agent.email.orEmpty()

                delta.text = Fmt.delta(context, agent.period?.calls_change_pct)

                score.text = Fmt.scoreOutOf100(agent.qa_score)
                reviews.text = if (agent.review_count > 0)
                    context.getString(R.string.perf_reviews, agent.review_count)
                else context.getString(R.string.perf_not_reviewed)

                calls.text = getString(R.string.perf_calls) + ": " + agent.total_calls
                leads.text = context.getString(R.string.perf_open_leads, agent.open_leads)
                connect.text = getString(R.string.perf_connect_rate) + ": " + Fmt.rate(agent.connect_rate)
                conversion.text = getString(R.string.perf_conversion) + ": " + Fmt.rate(agent.conversion_rate)

                Ui.applyDivider(divider, position, items.size)
                itemView.setOnClickListener { onClick(agent.agent_id) }
            }
        }
    }

    inner class LeaderboardAdapter(
        private val onClick: (Int) -> Unit
    ) : RecyclerView.Adapter<LeaderboardAdapter.Holder>() {

        private var items: List<LeaderboardEntry> = emptyList()

        fun submitList(list: List<LeaderboardEntry>) {
            items = list
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_performance, parent, false))

        override fun onBindViewHolder(holder: Holder, position: Int) = holder.bind(items[position], position)

        override fun getItemCount(): Int = items.size

        inner class Holder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val initials: TextView = itemView.findViewById(R.id.tvAgentInitials)
            private val name: TextView = itemView.findViewById(R.id.tvAgentName)
            private val email: TextView = itemView.findViewById(R.id.tvAgentEmail)
            private val delta: TextView = itemView.findViewById(R.id.tvAgentDelta)
            private val score: TextView = itemView.findViewById(R.id.tvAgentQaScore)
            private val reviews: TextView = itemView.findViewById(R.id.tvAgentReviews)
            private val calls: TextView = itemView.findViewById(R.id.tvAgentCalls)
            private val leads: TextView = itemView.findViewById(R.id.tvAgentLeads)
            private val connect: TextView = itemView.findViewById(R.id.tvAgentConnectRate)
            private val conversion: TextView = itemView.findViewById(R.id.tvAgentConversion)
            private val divider: View = itemView.findViewById(R.id.performanceDivider)

            fun bind(entry: LeaderboardEntry, position: Int) {
                val context = itemView.context
                initials.text = entry.initials
                name.text = "#${entry.rank}  ${entry.name}"
                email.text = entry.email.orEmpty()
                // This payload has no 30d-vs-prior period block, so the delta
                // line carries compliance instead of a fabricated comparison.
                delta.text = if (entry.compliance_violations > 0)
                    context.getString(R.string.perf_violations_count, entry.compliance_violations)
                else context.getString(R.string.perf_violations_clean)
                score.text = Fmt.scoreOutOf100(entry.qa_score)
                reviews.text = context.getString(R.string.perf_reviews, entry.review_count)
                calls.text = getString(R.string.perf_calls) + ": " + entry.total_calls
                leads.text = context.getString(R.string.perf_open_leads, entry.total_leads)
                connect.text = getString(R.string.perf_connect_rate) + ": " + Fmt.rate(entry.connect_rate)
                conversion.text = getString(R.string.perf_conversion) + ": " + Fmt.rate(entry.conversion_rate)

                Ui.applyDivider(divider, position, items.size)
                itemView.setOnClickListener { onClick(entry.agent_id) }
            }
        }
    }

    companion object {
        const val MODE_PERFORMANCE = 0
        const val MODE_LEADERBOARD = 1

        fun newInstance(mode: Int = MODE_PERFORMANCE) = PerformanceFragment().apply {
            this.mode = mode
        }
    }
}