package com.levoy.app

import com.levoy.app.sync.DeviceCall
import com.levoy.app.sync.DeviceSim

/** Everything the screens need from Android itself, so the UI code stays free of Context and intents. */
interface Os {
    fun dial(number: String)
    fun sms(number: String)
    fun whatsapp(number: String)
    fun copy(text: String)
    fun toast(text: String)

    fun requestCallLog(then: () -> Unit)
    fun requestContacts(then: () -> Unit)
    fun requestAllPermissions(then: () -> Unit)
    fun openAppSettings()
    fun openBatterySettings()
    fun openDefaultAppsSettings()
    fun openNotificationAccess()
    fun openOverlaySettings()
    fun canDrawOverlays(): Boolean
    fun notificationAccessGranted(): Boolean

    fun batteryUnrestricted(): Boolean
    fun hasCallLogPermission(): Boolean
    fun deviceSims(): List<DeviceSim>

    fun isDefaultDialer(): Boolean
    fun requestDialerRole(then: (Boolean) -> Unit)
    fun hasCallPhone(): Boolean
    fun requestCallPhone(then: () -> Unit)
    fun requestOutgoingCalls(then: () -> Unit)
    fun requestRecordAudio(then: () -> Unit)
    fun hasRecordAudio(): Boolean
    fun requestAudioLibrary(then: () -> Unit)
    fun hasAudioLibrary(): Boolean
    fun startQuickCall()
    fun stopQuickCall()
    fun openRating()
    fun requestNotifications()

    fun shareFile(bytes: ByteArray, name: String, mime: String)
    fun pickBackupFile(then: (String) -> Unit)
    fun openUrl(url: String)
    fun shareText(text: String)
}
