package com.levoy.app.fragment

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.telephony.TelephonyManager
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.levoy.app.MainActivity
import com.levoy.app.R
import com.levoy.app.model.CallEvent
import com.levoy.app.network.ApiClient
import com.levoy.app.settings.AppPreferences
import com.levoy.app.util.Fmt
import com.levoy.app.util.Ui.hide
import com.levoy.app.util.Ui.show
import com.levoy.app.util.Ui.showIf
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText

/**
 * SIM number verification — the reference's three option cards.
 *
 * IMPORTANT SCOPE NOTE: the backend exposes no verification endpoint
 * (/api/auth/me carries no sim field, and no route accepts one). The result is
 * therefore stored **locally only** in AppPreferences, exactly as the parent
 * task required. Nothing is invented against backend-next/server.js. If the
 * server later grows a `PATCH /api/auth/me {sim_verified}` route, the single
 * place to add the call is [persistVerified].
 *
 * Three paths, per the reference:
 *  1. Verify via Call Log — read the device number, then pick an outgoing call
 *     from the caller's own history; we compare the digits.
 *  2. Verify via Call — place a self-call and watch the device call log for it.
 *  3. Skip (Not Recommended) — with the reason spelled out.
 */
class SimVerificationFragment : Fragment() {

    private var api: ApiClient? = null
    private lateinit var prefs: AppPreferences

    private var deviceNumber: String? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_sim_verification, container, false)
        api = ApiClient(requireContext())
        prefs = AppPreferences.getInstance(requireContext())

        deviceNumber = prefs.verifiedSimNumber ?: readDeviceNumber()

        bindNumber(view)
        buildOptionCards(view)

        view.findViewById<MaterialButton>(R.id.btnSimLater).setOnClickListener { goBack() }

        return view
    }

    // ─── Device number ───

    private fun bindNumber(root: View) {
        val numberView = root.findViewById<TextView>(R.id.tvSimNumber)
        val hintView = root.findViewById<TextView>(R.id.tvSimStatus)
        val number = deviceNumber

        if (!number.isNullOrBlank()) {
            numberView.text = number
            hintView.text = getString(R.string.sim_your_number)
            hintView.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_secondary))
            hintView.show()
        } else {
            numberView.text = getString(R.string.sim_unknown_number)
            numberView.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_tertiary))
            hintView.hide()
        }
    }

    /**
     * TelephonyManager.getLine1Number() can return null (no SIM, no permission,
     * or the carrier simply withholds it). Null is a normal outcome here, not an
     * error — the screen says so and the call-log path still works because it
     * compares against history rather than the live number.
     */
    private fun readDeviceNumber(): String? {
        val granted = ContextCompat.checkSelfPermission(
            requireContext(), Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) return null
        return runCatching {
            val tm = requireContext().getSystemService(ContextCompat.TELEPHONY_SERVICE) as? TelephonyManager
            tm?.line1Number?.takeIf { it.isNotBlank() }
        }.getOrNull()
    }

    // ─── Option cards ───

    private fun buildOptionCards(root: View) {
        bindOption(
            root.findViewById(R.id.optionCallLog), R.drawable.ic_calls,
            R.string.sim_verify_via_call_log, R.string.sim_verify_via_call_log_sub
        ) { verifyViaCallLog() }

        bindOption(
            root.findViewById(R.id.optionViaCall), R.drawable.ic_quickaction,
            R.string.sim_verify_via_call, R.string.sim_verify_via_call_sub
        ) { verifyViaCall() }

        val skipCard = root.findViewById(R.id.optionSkip)
        bindOption(
            skipCard, R.drawable.ic_close,
            R.string.sim_skip, R.string.sim_skip_body
        ) { confirmSkip() }
        // The reference labels the skip path "(Not Recommended)" explicitly.
        skipCard.findViewById<TextView>(R.id.optionWarning).show()
    }

    private fun bindOption(
        card: View,
        iconRes: Int,
        titleRes: Int,
        subtitleRes: Int,
        onClick: () -> Unit
    ) {
        card.findViewById<ImageView>(R.id.optionIcon).setImageResource(iconRes)
        card.findViewById<TextView>(R.id.optionTitle).setText(titleRes)
        card.findViewById<TextView>(R.id.optionSubtitle).setText(subtitleRes)
        card.setOnClickListener { onClick() }
    }

    // ─── Path 1: verify via call log ───

    private fun verifyViaCallLog() {
        if (!hasReadCallLog()) return
        val root = view ?: return
        val progress = root.findViewById<ProgressBar>(R.id.progressSim)
        val status = root.findViewById<TextView>(R.id.tvSimStatus)

        progress.show()
        status.text = getString(R.string.sim_looking)
        status.show()

        api?.getCalls(limit = 25, direction = "outgoing")?.onSuccess { calls ->
            if (view == null) return@onSuccess
            progress.hide()
            if (calls.isEmpty()) {
                status.text = getString(R.string.sim_no_outgoing_calls)
                status.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_secondary))
                return@onSuccess
            }
            showCallPicker(calls)
        }?.onFailure { error ->
            if (view == null) return@onFailure
            progress.hide()
            status.text = (error.message ?: "") + " " + getString(R.string.sim_no_outgoing_calls)
            status.setTextColor(ContextCompat.getColor(requireContext(), R.color.danger))
            status.show()
        }
    }

    private fun showCallPicker(calls: List<CallEvent>) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_pick_call, null)
        val recycler = dialogView.findViewById<RecyclerView>(R.id.recyclerPickCall)
        val emptyLabel = dialogView.findViewById<TextView>(R.id.tvPickCallEmpty)
        recycler.layoutManager = LinearLayoutManager(context)

        val adapter = PickCallAdapter(calls) { call ->
            AlertDialog.Builder(requireContext())
                .setTitle(R.string.sim_confirm)
                .setMessage(
                    getString(R.string.sim_call_detail, call.displayName,
                        Fmt.dateTime(requireContext(), call.timestamp))
                )
                .setPositiveButton(R.string.sim_continue) { _, _ ->
                    if (matchesDeviceNumber(call.phone_number)) {
                        persistVerified(call.phone_number, "call_log")
                    } else {
                        showMismatch()
                    }
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }
        recycler.adapter = adapter

        if (calls.isEmpty()) {
            emptyLabel.show()
            recycler.hide()
        }

        AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    /** Digits-only compare so +91 98765 43210 and 9876543210 match. */
    private fun matchesDeviceNumber(candidate: String): Boolean {
        val own = deviceNumber ?: return false
        val a = Fmt.digitsOnly(candidate).takeLast(10)
        val b = Fmt.digitsOnly(own).takeLast(10)
        return a.isNotEmpty() && a == b
    }

    private fun showMismatch() {
        val status = view?.findViewById<TextView>(R.id.tvSimStatus) ?: return
        status.text = getString(R.string.sim_no_matching_call)
        status.setTextColor(ContextCompat.getColor(requireContext(), R.color.danger))
        status.show()
    }

    // ─── Path 2: verify via a self-call ───

    private fun verifyViaCall() {
        val own = deviceNumber
        if (own.isNullOrBlank()) {
            val status = view?.findViewById<TextView>(R.id.tvSimStatus) ?: return
            status.text = getString(R.string.sim_unknown_number)
            status.setTextColor(ContextCompat.getColor(requireContext(), R.color.danger))
            status.show()
            return
        }

        val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$own"))
        // ACTION_CALL needs CALL_PHONE; fall back to the dialer when it is not
        // granted so the user can still place the self-call manually.
        val canPlace = ContextCompat.checkSelfPermission(
            requireContext(), Manifest.permission.CALL_PHONE
        ) == PackageManager.PERMISSION_GRANTED

        runCatching {
            if (canPlace) {
                startActivity(intent)
                onSelfCallRequested(own)
            } else {
                startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$own")))
                waitForManualSelfCall()
            }
        }.onFailure {
            val status = view?.findViewById<TextView>(R.id.tvSimStatus) ?: return
            status.text = getString(R.string.sim_call_failed)
            status.setTextColor(ContextCompat.getColor(requireContext(), R.color.danger))
            status.show()
        }
    }

    private fun onSelfCallRequested(own: String) {
        val root = view ?: return
        val progress = root.findViewById<ProgressBar>(R.id.progressSim)
        val status = root.findViewById<TextView>(R.id.tvSimStatus)
        progress.show()
        status.text = getString(R.string.sim_placing_call, own)
        status.show()
        // The call has to be placed and ended before it lands in the call log.
        root.postDelayed({ checkForSelfCall(own) }, SELF_CALL_POLL_MS)
    }

    private fun waitForManualSelfCall() {
        val root = view ?: return
        val progress = root.findViewById<ProgressBar>(R.id.progressSim)
        val status = root.findViewById<TextView>(R.id.tvSimStatus)
        val own = deviceNumber ?: return
        progress.show()
        status.text = getString(R.string.sim_looking)
        status.show()
        root.postDelayed({ checkForSelfCall(own) }, SELF_CALL_POLL_MS)
    }

    private fun checkForSelfCall(own: String) {
        if (view == null) return
        val root = view ?: return
        val progress = root.findViewById<ProgressBar>(R.id.progressSim)
        val status = root.findViewById<TextView>(R.id.tvSimStatus)

        api?.getCalls(limit = 10, direction = "outgoing")?.onSuccess { calls ->
            if (view == null) return@onSuccess
            val match = calls.firstOrNull { matchesDeviceNumber(it.phone_number) }
            if (match != null) {
                progress.hide()
                persistVerified(match.phone_number, "call")
            } else {
                // Keep polling: the user may still be dialling.
                root.postDelayed({ checkForSelfCall(own) }, SELF_CALL_POLL_MS)
                status.text = getString(R.string.sim_looking)
                status.show()
            }
        }?.onFailure {
            if (view == null) return@onFailure
            progress.hide()
        }
    }

    // ─── Path 3: skip ───

    private fun confirmSkip() {
        AlertDialog.Builder(requireContext())
            .setTitle(R.string.sim_skip)
            .setMessage(R.string.sim_skip_body)
            .setPositiveButton(R.string.sim_skip) { _, _ ->
                prefs.simVerificationMethod = "skipped"
                goBack()
            }
            .setNegativeButton(R.string.sim_continue, null)
            .show()
    }

    // ─── Shared ───

    /** Local-only persistence — see the scope note at the top of this class. */
    private fun persistVerified(number: String, method: String) {
        prefs.isSimVerified = true
        prefs.verifiedSimNumber = number
        prefs.simVerificationMethod = method
        deviceNumber = number

        val root = view ?: return
        val progress = root.findViewById<ProgressBar>(R.id.progressSim)
        val status = root.findViewById<TextView>(R.id.tvSimStatus)
        val numberView = root.findViewById<TextView>(R.id.tvSimNumber)

        progress.hide()
        numberView.text = number
        status.text = getString(R.string.sim_verified_body, number)
        status.setTextColor(ContextCompat.getColor(requireContext(), R.color.success))
        status.show()

        Toast.makeText(requireContext(), R.string.sim_verified_title, Toast.LENGTH_SHORT).show()
        root.postDelayed({ goBack() }, VERIFIED_LINGER_MS)
    }

    private fun goBack() {
        val host = activity as? MainActivity ?: return
        host.onSupportNavigateUp()
    }

    private fun hasReadCallLog(): Boolean {
        val granted = ContextCompat.checkSelfPermission(
            requireContext(), Manifest.permission.READ_CALL_LOG
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) return true

        // Ask inline rather than silently failing: without this permission the
        // user cannot tell why nothing happens on tap.
        ActivityCompat.requestPermissions(
            requireActivity(),
            arrayOf(Manifest.permission.READ_CALL_LOG),
            REQUEST_READ_CALL_LOG
        )
        return false
    }

    /** Minimal adapter for the "pick the call you placed" list. */
    private inner class PickCallAdapter(
        private val items: List<CallEvent>,
        private val onPick: (CallEvent) -> Unit
    ) : RecyclerView.Adapter<PickCallAdapter.Holder>() {

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
            Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_pick_call, parent, false))

        override fun onBindViewHolder(holder: Holder, position: Int) = holder.bind(items[position])

        override fun getItemCount(): Int = items.size

        inner class Holder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val name: TextView = itemView.findViewById(R.id.tvPickCallName)
            private val meta: TextView = itemView.findViewById(R.id.tvPickCallMeta)
            private val check: ImageView = itemView.findViewById(R.id.ivPickCallCheck)

            fun bind(call: CallEvent) {
                val context = itemView.context
                name.text = call.displayName
                meta.text = Fmt.dateTime(context, call.timestamp) + " · " + Fmt.duration(call.duration_seconds)
                // Mark the row that already matches this device's number.
                check.showIf(matchesDeviceNumber(call.phone_number))
                itemView.setOnClickListener { onPick(call) }
            }
        }
    }

    companion object {
        private const val SELF_CALL_POLL_MS = 6_000L
        private const val VERIFIED_LINGER_MS = 1_400L
        private const val REQUEST_READ_CALL_LOG = 4201

        fun newInstance() = SimVerificationFragment()
    }
}