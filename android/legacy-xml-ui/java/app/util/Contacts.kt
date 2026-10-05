package com.levoy.app.util

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.provider.ContactsContract
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.levoy.app.R

/**
 * Quick Action's "Save Contact" writes an unknown caller number into the
 * device phonebook via ContactsContract.
 *
 * PERMISSION NOTE: the parent task stated that saving a contact needs no
 * permission. That is not the case on Android — inserting a raw contact
 * requires the runtime WRITE_CONTACTS permission (protected since API 23).
 * Rather than ship a button that throws SecurityException, the write is
 * guarded and the permission is requested when the user taps Save, hosted by
 * [ContactSaveActivity]. Nothing else in the app needs it.
 *
 * [isSaved] additionally needs READ_CONTACTS; without it the answer is
 * "unknown", which the overlay renders as "not saved" rather than pretending.
 */
object Contacts {

    fun hasWritePermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(
            context, Manifest.permission.WRITE_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED

    fun hasReadPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED

    /**
     * Entry point used by the overlay. The overlay window is not an Activity,
     * so it delegates to [ContactSaveActivity], which owns the name prompt and
     * the permission request.
     *
     * KNOWN LIMITATION: on Android 10+ (API 29) starting an activity from the
     * background is restricted, and an in-call moment is by definition
     * background for us — the dialler owns the foreground. Some OEM builds
     * permit it anyway, some silently drop the intent; the call is wrapped in
     * runCatching so a block degrades to "nothing happened" rather than a
     * crash. The same Save Contact action is therefore ALSO offered from the
     * in-app call detail sheet, where an Activity certainly exists. Do not
     * treat the overlay path alone as a guaranteed entry point.
     */
    fun requestSave(context: Context, number: String?) {
        if (number.isNullOrBlank()) {
            Toast.makeText(context, R.string.quick_action_unknown_number, Toast.LENGTH_SHORT).show()
            return
        }
        ContactSaveActivity.start(context, number)
    }

    /**
     * Inserts a raw contact with a name and a mobile phone row.
     * Returns false when the permission is missing or the insert throws.
     */
    fun save(context: Context, number: String, displayName: String): Boolean {
        if (!hasWritePermission(context)) return false
        val resolver = context.contentResolver

        val rawUri: Uri = resolver.insert(
            ContactsContract.RawContacts.CONTENT_URI,
            ContentValues().apply {
                put(ContactsContract.RawContacts.ACCOUNT_TYPE, null)
                put(ContactsContract.RawContacts.ACCOUNT_NAME, null)
            }
        ) ?: return false

        val rawId = ContentUris.parseId(rawUri)

        resolver.insert(
            ContactsContract.Data.CONTENT_URI,
            ContentValues().apply {
                put(ContactsContract.Data.RAW_CONTACT_ID, rawId)
                put(
                    ContactsContract.Data.MIMETYPE,
                    ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE
                )
                put(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, displayName)
            }
        )

        resolver.insert(
            ContactsContract.Data.CONTENT_URI,
            ContentValues().apply {
                put(ContactsContract.Data.RAW_CONTACT_ID, rawId)
                put(
                    ContactsContract.Data.MIMETYPE,
                    ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE
                )
                put(ContactsContract.CommonDataKinds.Phone.NUMBER, number)
                put(
                    ContactsContract.CommonDataKinds.Phone.TYPE,
                    ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE
                )
            }
        )

        return true
    }

    /** Digits-only compare so format variants match an existing contact. */
    fun isSaved(context: Context, number: String): Boolean {
        if (!hasReadPermission(context)) return false
        val digits = Fmt.digitsOnly(number).takeLast(10)
        if (digits.isEmpty()) return false

        var cursor: Cursor? = null
        return try {
            cursor = context.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
                null, null, null
            )
            val index = cursor?.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER) ?: -1
            var matched = false
            if (index >= 0) {
                while (cursor!!.moveToNext()) {
                    val stored = Fmt.digitsOnly(cursor!!.getString(index)).takeLast(10)
                    if (stored.isNotEmpty() && stored == digits) {
                        matched = true
                        break
                    }
                }
            }
            matched
        } catch (e: SecurityException) {
            // Permission revoked between the check and the query.
            false
        } catch (e: Exception) {
            false
        } finally {
            cursor?.close()
        }
    }
}