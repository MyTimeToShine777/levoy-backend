package com.levoy.app.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.levoy.app.R
import com.levoy.app.model.AgentQuality
import com.levoy.app.model.QualityCategory
import com.levoy.app.model.QualityReview
import com.levoy.app.network.ApiClient
import com.levoy.app.util.Fmt
import com.levoy.app.util.Ui
import com.levoy.app.util.Ui.hide
import com.levoy.app.util.Ui.show
import com.levoy.app.util.Ui.showIf

/**
 * QA deep dive for one agent: GET /api/agents/:id/quality.
 *
 * The headline number is the composite QA score; the per-category bars are
 * sorted worst-first because the actionable signal is the weakest category,
 * not the strongest.
 */
class QualityFragment : Fragment() {

    private var api: ApiClient? = null
    private var agentId = 0

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_quality, container, false)
        api = ApiClient(requireContext())
        agentId = arguments?.getInt(ARG_AGENT_ID, 0) ?: 0

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
        if (agentId == 0) {
            Ui.showEmptyState(
                root.findViewById(R.id.emptyState), R.drawable.ic_quality,
                R.string.empty_quality_title, R.string.empty_quality_body
            )
            return
        }

        val swipe = root.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh)
        val emptyState = root.findViewById<View>(R.id.emptyState)
        val errorState = root.findViewById<View>(R.id.errorState)

        swipe.isRefreshing = true
        errorState.hide()

        api?.getAgentQuality(agentId)?.onSuccess { quality ->
            if (view == null) return@onSuccess
            bind(root, quality)
            Ui.hideBoth(emptyState, errorState)
            if (quality.review_count == 0) {
                Ui.showEmptyState(
                    emptyState, R.drawable.ic_quality,
                    R.string.empty_quality_title, R.string.empty_quality_body
                )
            }
            swipe.isRefreshing = false
        }?.onFailure { error ->
            if (view == null) return@onFailure
            swipe.isRefreshing = false
            emptyState.hide()
            Ui.showErrorState(errorState, requireContext()) { refresh() }
            errorState.findViewById<TextView>(R.id.errorBody).text =
                (error.message ?: "") + " " + getString(R.string.perf_admin_only)
        }
    }

    private fun bind(root: View, quality: AgentQuality) {
        val context = requireContext()

        root.findViewById<TextView>(R.id.tvQualityInitials).text = quality.initials
        root.findViewById<TextView>(R.id.tvQualityAgentName).text = quality.agent.name
        root.findViewById<TextView>(R.id.tvQualityAgentEmail).text = quality.agent.email.orEmpty()

        root.findViewById<TextView>(R.id.tvQualityScore).text =
            Fmt.scoreOutOf100(quality.qa_score)
        root.findViewById<TextView>(R.id.tvQualityScoreHint).text =
            getString(R.string.quality_score_out_of, Fmt.scoreOutOf100(quality.qa_score))

        root.findViewById<TextView>(R.id.tvQuality30d).text = Fmt.scoreOutOf100(quality.qa_score_30d)
        root.findViewById<TextView>(R.id.tvQualityReviews).text = quality.review_count.toString()
        root.findViewById<TextView>(R.id.tvQualityViolations).text =
            quality.compliance_violations.toString()

        val min = quality.min_qa_score
        val max = quality.max_qa_score
        val rangeView = root.findViewById<TextView>(R.id.tvQualityRange)
        rangeView.text = if (min != null && max != null)
            getString(R.string.quality_range) + ": $min – $max"
        else getString(R.string.quality_range) + ": —"
        rangeView.show()

        bindCategories(root, quality)
        bindReviews(root, quality)
    }

    private fun bindCategories(root: View, quality: AgentQuality) {
        val container = root.findViewById<LinearLayout>(R.id.categoriesContainer)
        val noCategories = root.findViewById<TextView>(R.id.tvNoCategories)
        val worst = root.findViewById<TextView>(R.id.tvWorstCategory)

        container.removeAllViews()
        val categories = quality.categoriesWorstFirst

        if (categories.isEmpty()) {
            noCategories.show()
            worst.hide()
            return
        }
        noCategories.hide()

        quality.worst_category?.let { worst.text = getString(R.string.quality_worst_category, it) }
        worst.showIf(!quality.worst_category.isNullOrBlank())

        categories.forEachIndexed { index, category ->
            val row = layoutInflater.inflate(R.layout.item_quality_category, container, false)
            row.findViewById<TextView>(R.id.tvCategoryName).text = category.category
            row.findViewById<TextView>(R.id.tvCategoryScore).text =
                getString(R.string.quality_category_of_5, String.format(java.util.Locale.US, "%.2f", category.avg_score))
            row.findViewById<TextView>(R.id.tvCategoryMeta).text =
                getString(R.string.quality_weight, category.weight) + " · " +
                    getString(R.string.perf_reviews, category.ratings)

            val bar = row.findViewById<ProgressBar>(R.id.categoryBar)
            bar.max = 100
            bar.progress = category.pct_of_max.toInt().coerceIn(0, 100)

            Ui.applyDivider(row.findViewById(R.id.categoryDivider), index, categories.size)
            container.addView(row)
        }
    }

    private fun bindReviews(root: View, quality: AgentQuality) {
        val container = root.findViewById<LinearLayout>(R.id.reviewsContainer)
        val header = root.findViewById<TextView>(R.id.tvReviewsHeader)

        container.removeAllViews()
        val reviews = quality.recent_reviews

        header.showIf(reviews.isNotEmpty())
        if (reviews.isEmpty()) return

        reviews.forEachIndexed { index, review ->
            val row = layoutInflater.inflate(R.layout.item_quality_review, container, false)
            bindReview(row, review)
            Ui.applyDivider(row.findViewById(R.id.reviewDivider), index, reviews.size)
            container.addView(row)
        }
    }

    private fun bindReview(row: View, review: QualityReview) {
        val context = row.context
        row.findViewById<TextView>(R.id.tvReviewScore).text =
            getString(R.string.quality_score_of, review.overall_score)
        row.findViewById<TextView>(R.id.tvReviewDate).text =
            Fmt.relative(context, review.created_at)
        row.findViewById<TextView>(R.id.tvReviewViolation).showIf(review.is_compliance_violation)

        val notes = row.findViewById<TextView>(R.id.tvReviewNotes)
        val noteText = review.notes?.takeIf { it.isNotBlank() }
        notes.text = noteText ?: getString(R.string.quality_review_notes_none)
        notes.show()

        val reviewer = row.findViewById<TextView>(R.id.tvReviewer)
        reviewer.text = review.reviewer_name?.let {
            getString(R.string.quality_by, it)
        }.orEmpty()
        reviewer.showIf(!review.reviewer_name.isNullOrBlank())
    }

    companion object {
        private const val ARG_AGENT_ID = "agent_id"

        fun newInstance(agentId: Int) = QualityFragment().apply {
            arguments = Bundle().apply { putInt(ARG_AGENT_ID, agentId) }
        }
    }
}