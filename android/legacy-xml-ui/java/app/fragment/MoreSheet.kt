package com.levoy.app.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.levoy.app.MainActivity
import com.levoy.app.R
import com.google.android.material.bottomsheet.BottomSheetDialogFragment

/**
 * The "More" bottom-nav destination. Secondary screens live here instead of
 * crowding the 5-slot bar.
 *
 * Team / Performance / Quality rows are only inflated when the signed-in user
 * is an admin or manager — an agent never sees them at all, which is what the
 * web dashboard's gating does.
 */
class MoreSheet : BottomSheetDialogFragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.sheet_more, container, false)
        val host = activity as? MainActivity ?: return view
        val parent = view.findViewById<LinearLayout>(R.id.moreContainer)

        addRow(parent, R.drawable.ic_reports, R.string.reports, R.string.more_reports_sub) {
            dismiss(); host.openReports()
        }
        addRow(parent, R.drawable.ic_performance, R.string.performance, R.string.more_performance_sub) {
            dismiss()
            host.openSecondary(
                PerformanceFragment.newInstance(PerformanceFragment.MODE_PERFORMANCE),
                R.string.performance
            )
        }
        addRow(parent, R.drawable.ic_quality, R.string.quality, R.string.more_quality_sub) {
            dismiss()
            host.openSecondary(
                PerformanceFragment.newInstance(PerformanceFragment.MODE_LEADERBOARD),
                R.string.quality
            )
        }

        if (host.currentUserCanSeeTeamTools()) {
            addRow(parent, R.drawable.ic_team, R.string.team, R.string.team_workload_sub) {
                dismiss(); host.openTeam()
            }
        }

        addRow(parent, R.drawable.ic_settings, R.string.settings, R.string.more_settings_sub) {
            dismiss(); host.openSettings()
        }

        view.findViewById<TextView>(R.id.btnSheetLogout).setOnClickListener {
            dismiss()
            host.logout()
        }

        return view
    }

    private fun addRow(
        parent: LinearLayout,
        iconRes: Int,
        titleRes: Int,
        descriptionRes: Int,
        onClick: () -> Unit
    ) {
        val row = layoutInflater.inflate(R.layout.item_more_row, parent, false)
        row.findViewById<ImageView>(R.id.moreIcon).setImageResource(iconRes)
        row.findViewById<TextView>(R.id.moreTitle).setText(titleRes)
        row.findViewById<TextView>(R.id.moreDescription).setText(descriptionRes)
        row.setOnClickListener { onClick() }
        parent.addView(row)
    }

    companion object {
        const val TAG = "MoreSheet"

        fun newInstance() = MoreSheet()
    }
}
