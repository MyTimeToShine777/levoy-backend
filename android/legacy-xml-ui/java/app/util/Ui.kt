package com.levoy.app.util

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import com.levoy.app.R

/**
 * Small helpers so fragments don't repeat the same findViewById + show/hide
 * dance on every state change.
 */
object Ui {

    fun <T : View> View.find(id: Int): T = findViewById(id)

    fun View.show() { visibility = View.VISIBLE }

    fun View.hide() { visibility = View.GONE }

    fun View.showIf(condition: Boolean) {
        visibility = if (condition) View.VISIBLE else View.GONE
    }

    fun TextView.setTextOrHide(value: CharSequence?) {
        if (value.isNullOrBlank()) hide() else { text = value; show() }
    }

    /**
     * Configures one of the included view_stat_card views. The <include> tag's
     * android:id replaces the included root's id, so the card must be located
     * first and its children resolved relative to it.
     */
    fun bindStatCard(
        card: View,
        @StringRes labelRes: Int,
        value: CharSequence,
        hint: CharSequence? = null
    ) {
        card.findViewById<TextView>(R.id.statLabel).setText(labelRes)
        card.findViewById<TextView>(R.id.statValue).text = value
        val hintView = card.findViewById<TextView>(R.id.statHint)
        if (hint.isNullOrBlank()) hintView.hide() else { hintView.text = hint; hintView.show() }
    }

    fun bindSectionHeader(
        header: View,
        @StringRes eyebrowRes: Int,
        title: CharSequence,
        actionLabel: CharSequence? = null,
        onAction: (() -> Unit)? = null
    ) {
        header.findViewById<TextView>(R.id.sectionEyebrow).setText(eyebrowRes)
        header.findViewById<TextView>(R.id.sectionTitle).text = title
        val action = header.findViewById<TextView>(R.id.sectionAction)
        if (actionLabel.isNullOrBlank() || onAction == null) {
            action.hide()
        } else {
            action.text = actionLabel
            action.setOnClickListener { onAction() }
            action.show()
        }
    }

    /** The shared view_empty_state include. */
    fun showEmptyState(
        emptyRoot: View,
        @DrawableRes iconRes: Int,
        @StringRes titleRes: Int,
        @StringRes bodyRes: Int,
        actionLabel: CharSequence? = null,
        onAction: (() -> Unit)? = null
    ) {
        emptyRoot.findViewById<ImageView>(R.id.emptyIcon).setImageResource(iconRes)
        emptyRoot.findViewById<TextView>(R.id.emptyTitle).setText(titleRes)
        emptyRoot.findViewById<TextView>(R.id.emptyBody).setText(bodyRes)
        // emptyAction is a MaterialButton (a TextView subclass); bind as a View
        // so the cast cannot fail on the concrete widget type.
        val action = emptyRoot.findViewById<View>(R.id.emptyAction)
        if (actionLabel.isNullOrBlank() || onAction == null) {
            action.hide()
        } else {
            (action as TextView).text = actionLabel
            action.setOnClickListener { onAction() }
            action.show()
        }
        emptyRoot.show()
    }

    fun showErrorState(errorRoot: View, context: Context, onRetry: () -> Unit) {
        errorRoot.findViewById<View>(R.id.errorRetry).setOnClickListener { onRetry() }
        errorRoot.show()
    }

    fun hideBoth(emptyRoot: View?, errorRoot: View?) {
        emptyRoot?.hide()
        errorRoot?.hide()
    }

    /** Last-row divider is dropped so the list does not end on a hairline. */
    fun applyDivider(divider: View, position: Int, itemCount: Int) {
        divider.visibility = if (position == itemCount - 1) View.GONE else View.VISIBLE
    }

    fun inflate(context: Context, layoutRes: Int, parent: ViewGroup? = null): View =
        LayoutInflater.from(context).inflate(layoutRes, parent, false)

    fun resolve(context: Context, @StringRes res: Int): String = context.getString(res)
}