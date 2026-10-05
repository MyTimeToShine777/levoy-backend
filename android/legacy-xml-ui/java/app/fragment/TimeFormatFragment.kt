package com.levoy.app.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.levoy.app.R
import com.levoy.app.settings.AppPreferences
import com.levoy.app.util.Ui.hide
import com.levoy.app.util.Ui.show
import com.levoy.app.util.Ui.showIf

/**
 * Time Format sub-screen — the reference's two-row list with an amber filled
 * circle / black check on the selected row, and nothing else.
 *
 * The choice is device-local and applies immediately: Formatters reads it on
 * every bind, so returning to any list re-renders in the new format.
 */
class TimeFormatFragment : Fragment() {

    private lateinit var prefs: AppPreferences

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_time_format, container, false)
        prefs = AppPreferences.getInstance(requireContext())

        val row12 = view.findViewById<View>(R.id.row12Hour)
        val row24 = view.findViewById<View>(R.id.row24Hour)

        row12.findViewById<ImageView>(R.id.rowIcon).setImageResource(R.drawable.ic_time)
        row12.findViewById<TextView>(R.id.rowTitle).setText(R.string.settings_time_12)

        row24.findViewById<ImageView>(R.id.rowIcon).setImageResource(R.drawable.ic_time)
        row24.findViewById<TextView>(R.id.rowTitle).setText(R.string.settings_time_24)

        // No descriptions on this screen — the reference is a bare two-option list.
        row12.findViewById<TextView>(R.id.rowDescription).hide()
        row24.findViewById<TextView>(R.id.rowDescription).hide()

        row12.setOnClickListener { select(is24 = false) }
        row24.setOnClickListener { select(is24 = true) }

        bind(view)
        return view
    }

    private fun select(is24: Boolean) {
        prefs.is24HourTime = is24
        view?.let { bind(it) }
    }

    private fun bind(root: View) {
        val is24 = prefs.is24HourTime

        val row12 = root.findViewById<View>(R.id.row12Hour)
        val row24 = root.findViewById<View>(R.id.row24Hour)

        row12.findViewById<View>(R.id.rowControl).show()
        row24.findViewById<View>(R.id.rowControl).show()
        row12.findViewById<ImageView>(R.id.rowCheck).showIf(!is24)
        row24.findViewById<ImageView>(R.id.rowCheck).showIf(is24)
        row12.findViewById<View>(R.id.rowSwitch).hide()
        row24.findViewById<View>(R.id.rowSwitch).hide()
        row12.findViewById<View>(R.id.rowChevron).hide()
        row24.findViewById<View>(R.id.rowChevron).hide()

        // The bottom row is the last thing on screen — no trailing hairline.
        row12.findViewById<View>(R.id.rowDivider).show()
        row24.findViewById<View>(R.id.rowDivider).hide()

        root.findViewById<TextView>(R.id.tvTimeFormatHint).text = getString(
            R.string.settings_time_format_sub
        )
    }

    companion object {
        fun newInstance() = TimeFormatFragment()
    }
}