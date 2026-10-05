package com.levoy.app.util

import android.Manifest
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.levoy.app.R
import com.google.android.material.textfield.TextInputEditText

/**
 * Transparent, theme-less host for the Quick Action "Save Contact" flow.
 *
 * A TYPE_APPLICATION_OVERLAY window is not an Activity, so it cannot show a
 * dialog or run a permission request. This activity is started with
 * FLAG_ACTIVITY_NEW_TASK from the overlay, does the work in a few lines, and
 * finishes immediately — the user never sees a full screen.
 */
class ContactSaveActivity : AppCompatActivity() {

    private var number: String = ""

    private val requestWriteContacts = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) promptForName() else finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        number = intent.getStringExtra(EXTRA_NUMBER).orEmpty()

        if (number.isBlank()) {
            finish()
            return
        }
        if (!Contacts.hasWritePermission(this)) {
            requestWriteContacts.launch(Manifest.permission.WRITE_CONTACTS)
        } else {
            promptForName()
        }
    }

    private fun promptForName() {
        if (Contacts.isSaved(this, number)) {
            Toast.makeText(this, R.string.quick_action_already_saved, Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        val dialogView = layoutInflater.inflate(R.layout.dialog_note, null)
        val nameField = dialogView.findViewById<TextInputEditText>(R.id.etNote)
        nameField.setHint(getString(R.string.quick_action_contact_name_hint))

        AlertDialog.Builder(this)
            .setTitle(R.string.quick_action_contact_name_prompt)
            .setMessage(number)
            .setView(dialogView)
            .setPositiveButton(R.string.save) { _, _ ->
                val name = nameField.text?.toString()?.trim().orEmpty()
                val saved = Contacts.save(this, number, name.ifBlank { number })
                Toast.makeText(
                    this,
                    if (saved) getString(R.string.quick_action_contact_saved, name.ifBlank { number })
                    else getString(R.string.quick_action_contact_failed),
                    Toast.LENGTH_SHORT
                ).show()
                finish()
            }
            .setNegativeButton(android.R.string.cancel) { _, _ -> finish() }
            .setOnCancelListener { finish() }
            .show()
    }

    companion object {
        private const val EXTRA_NUMBER = "contact_number"

        fun start(context: Context, number: String) {
            val intent = Intent(context, ContactSaveActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION)
                putExtra(EXTRA_NUMBER, number)
            }
            runCatching { context.startActivity(intent) }
        }
    }
}
