package com.levoy.app

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.app.role.RoleManager
import android.os.Build
import android.os.PowerManager
import android.telecom.TelecomManager
import com.levoy.app.calls.QuickCallService
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.FileProvider
import com.levoy.app.sync.CallLogReader
import com.levoy.app.sync.DeviceCall
import com.levoy.app.sync.DeviceSim
import com.levoy.app.ui.CallioRoot
import java.io.File

class MainActivity : ComponentActivity(), Os {
    private val model: AppModel by viewModels()

    private var afterPermission: (() -> Unit)? = null
    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        model.refreshPermissions()
        afterPermission?.invoke(); afterPermission = null
    }
    private var afterPick: ((String) -> Unit)? = null
    private val pickLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runCatching { contentResolver.openInputStream(uri)?.bufferedReader()?.readText() }.getOrNull()?.let { afterPick?.invoke(it) }
        afterPick = null
    }

    private var afterFolder: ((String) -> Unit)? = null
    private val folderLauncher = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            // keep the permission after the app restarts, otherwise the background sync could not read the folder
            runCatching { contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            afterFolder?.invoke(uri.toString())
        }
        afterFolder = null
    }

    private var afterRole: ((Boolean) -> Unit)? = null
    private val roleLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        afterRole?.invoke(isDefaultDialer()); afterRole = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { CallioRoot(model, this) }
        handleDial(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDial(intent)
    }

    /** A tel: link or "dial" request (from another app, or because we are the default phone app) opens the dial pad. */
    private fun handleDial(i: Intent?) {
        if (i == null || (i.action != Intent.ACTION_DIAL && i.action != Intent.ACTION_VIEW)) return
        if (i.data?.scheme == "levoy" && i.data?.host == "premium") { model.onPaymentReturn(); return }
        val n = i.data?.takeIf { it.scheme == "tel" }?.schemeSpecificPart ?: return
        model.openDialpadWith(n)
    }

    override fun onResume() {
        super.onResume()
        model.onResume(this)
    }

    private fun ask(perms: Array<String>, then: () -> Unit) {
        val missing = perms.filter { !CallLogReader.has(this, it) }
        if (missing.isEmpty()) { then(); return }
        afterPermission = then
        permissionLauncher.launch(missing.toTypedArray())
    }

    private fun start(intent: Intent) { runCatching { startActivity(intent) }.onFailure { toast("Nothing on this phone can handle that") } }

    override fun dial(number: String) {
        // as the default phone app Callio places the call itself; otherwise the system dialler opens with the number
        if (isDefaultDialer() && hasCallPhone()) {
            runCatching { (getSystemService(Context.TELECOM_SERVICE) as TelecomManager).placeCall(Uri.fromParts("tel", number, null), null); return }
        }
        start(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(number)}")))
    }
    override fun sms(number: String) = start(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${Uri.encode(number)}")))
    override fun whatsapp(number: String) {
        val d = number.filter { it.isDigit() }
        start(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/${if (d.length == 10) "91$d" else d}")))
    }
    override fun copy(text: String) {
        (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("number", text))
        toast("Copied")
    }
    override fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()

    override fun requestCallLog(then: () -> Unit) = ask(arrayOf(Manifest.permission.READ_CALL_LOG, Manifest.permission.READ_PHONE_STATE), then)
    override fun requestContacts(then: () -> Unit) = ask(arrayOf(Manifest.permission.READ_CONTACTS), then)
    override fun requestAllPermissions(then: () -> Unit) = ask(
        arrayOf(Manifest.permission.READ_CALL_LOG, Manifest.permission.READ_PHONE_STATE, Manifest.permission.READ_CONTACTS), then,
    )

    override fun openAppSettings() = start(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
    override fun openBatterySettings() = start(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    override fun openDefaultAppsSettings() = start(Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS))
    override fun openNotificationAccess() = start(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"))
    override fun openOverlaySettings() = start(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
    override fun canDrawOverlays() = Settings.canDrawOverlays(this)
    override fun notificationAccessGranted() = androidx.core.app.NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)

    override fun batteryUnrestricted() = (getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName)
    override fun hasCallLogPermission() = CallLogReader.canReadLog(this)
    override fun deviceSims(): List<DeviceSim> = CallLogReader.sims(this)

    override fun isDefaultDialer() = (getSystemService(Context.TELECOM_SERVICE) as TelecomManager).defaultDialerPackage == packageName
    override fun requestDialerRole(then: (Boolean) -> Unit) {
        if (Build.VERSION.SDK_INT < 29) { then(false); return }
        val rm = getSystemService(RoleManager::class.java)
        if (!rm.isRoleAvailable(RoleManager.ROLE_DIALER)) { then(false); return }
        if (rm.isRoleHeld(RoleManager.ROLE_DIALER)) { then(true); return }
        afterRole = then
        roleLauncher.launch(rm.createRequestRoleIntent(RoleManager.ROLE_DIALER))
    }
    override fun hasCallPhone() = CallLogReader.has(this, Manifest.permission.CALL_PHONE)
    override fun requestCallPhone(then: () -> Unit) = ask(
        if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.CALL_PHONE, Manifest.permission.POST_NOTIFICATIONS) else arrayOf(Manifest.permission.CALL_PHONE), then,
    )
    override fun requestOutgoingCalls(then: () -> Unit) = ask(
        if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.PROCESS_OUTGOING_CALLS, Manifest.permission.POST_NOTIFICATIONS) else arrayOf(Manifest.permission.PROCESS_OUTGOING_CALLS), then,
    )
    override fun requestRecordAudio(then: () -> Unit) = ask(
        if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS) else arrayOf(Manifest.permission.RECORD_AUDIO), then,
    )
    override fun hasRecordAudio() = CallLogReader.has(this, Manifest.permission.RECORD_AUDIO)
    override fun requestAudioLibrary(then: () -> Unit) = ask(arrayOf(com.levoy.app.sync.PhoneRecordings.permission()), then)
    override fun hasAudioLibrary() = com.levoy.app.sync.PhoneRecordings.canRead(this)
    override fun requestNotifications() { if (Build.VERSION.SDK_INT >= 33) ask(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) { } }
    override fun startQuickCall() = QuickCallService.start(this)
    override fun stopQuickCall() = QuickCallService.stop(this)
    override fun openRating() {
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName"))) }
            .onFailure { start(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$packageName"))) }
    }

    override fun shareFile(bytes: ByteArray, name: String, mime: String) {
        val dir = File(cacheDir, "exports").apply { mkdirs() }
        val f = File(dir, name).apply { writeBytes(bytes) }
        val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
        start(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = mime; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }, name))
    }

    override fun pickRecordingFolder(then: (String) -> Unit) { afterFolder = then; folderLauncher.launch(null) }
    override fun pickBackupFile(then: (String) -> Unit) { afterPick = then; pickLauncher.launch(arrayOf("application/json", "text/plain", "*/*")) }
    override fun openUrl(url: String) = start(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    override fun shareText(text: String) = start(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }, "Share"))
}
