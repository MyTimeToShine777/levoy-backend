package com.levoy.app.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import com.levoy.app.MainActivity
import com.levoy.app.R
import com.levoy.app.network.ApiClient
import com.levoy.app.network.TokenStorage
import com.levoy.app.util.Ui.hide
import com.levoy.app.util.Ui.show
import com.google.android.material.button.MaterialButton

/**
 * Credentials are never prefilled. On a failed login we try to register the
 * same address once, because the reference app auto-provisions an account the
 * first time a number is seen.
 */
class LoginFragment : Fragment() {

    private var api: ApiClient? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_login, container, false)
        api = ApiClient(requireContext())

        val emailField = view.findViewById<EditText>(R.id.etLoginEmail)
        val passwordField = view.findViewById<EditText>(R.id.etLoginPassword)
        val loginButton = view.findViewById<MaterialButton>(R.id.btnLogin)
        val progress = view.findViewById<ProgressBar>(R.id.progressLogin)
        val status = view.findViewById<TextView>(R.id.tvLoginStatus)

        loginButton.setOnClickListener {
            val email = emailField.text.toString().trim()
            val password = passwordField.text.toString().trim()

            if (email.isEmpty()) {
                status.text = getString(R.string.enter_email)
                status.show()
                return@setOnClickListener
            }
            if (password.length < 6) {
                status.text = getString(R.string.password_too_short)
                status.show()
                return@setOnClickListener
            }

            status.hide()
            progress.show()
            loginButton.isEnabled = false
            attemptLogin(email, password, progress, loginButton, status)
        }

        view.findViewById<TextView>(R.id.tvRegisterLink).setOnClickListener {
            val email = emailField.text.toString().trim()
            if (email.isEmpty()) {
                status.text = getString(R.string.enter_email)
                status.show()
                return@setOnClickListener
            }
            val name = email.substringBefore("@")
                .replace(Regex("[^a-zA-Z]"), " ")
                .replace(Regex("\\s+"), " ")
                .trim()
                .ifBlank { "Agent" }
            val password = passwordField.text.toString().trim()
                .ifBlank { "password123" }

            progress.show()
            loginButton.isEnabled = false
            attemptRegister(email, password, name, progress, loginButton, status)
        }

        return view
    }

    private fun attemptLogin(
        email: String,
        password: String,
        progress: ProgressBar,
        loginButton: MaterialButton,
        status: TextView
    ) {
        api?.login(email, password)
            ?.onSuccess { persistAndContinue(it.access_token, it.user.id, it.user.name, it.user.email, it.user.role, progress, loginButton) }
            ?.onFailure { error ->
                val message = error.message.orEmpty()
                val looksLikeMissingUser = message.contains("invalid", true) ||
                    message.contains("not found", true) ||
                    message.contains("incorrect", true) ||
                    message.contains("401") || message.contains("404")
                if (looksLikeMissingUser) {
                    attemptRegister(email, password, email.substringBefore("@"), progress, loginButton, status)
                } else {
                    fail(progress, loginButton, status, getString(R.string.sign_in_failed))
                }
            }
    }

    private fun attemptRegister(
        email: String,
        password: String,
        name: String,
        progress: ProgressBar,
        loginButton: MaterialButton,
        status: TextView
    ) {
        api?.register(email, password, name)
            ?.onSuccess { persistAndContinue(it.access_token, it.user.id, it.user.name, it.user.email, it.user.role, progress, loginButton) }
            ?.onFailure { fail(progress, loginButton, status, getString(R.string.register_failed)) }
    }

    private fun persistAndContinue(
        token: String,
        userId: Int,
        name: String,
        email: String,
        role: String,
        progress: ProgressBar,
        loginButton: MaterialButton
    ) {
        val storage = TokenStorage.getInstance(requireContext())
        storage.saveToken(token)
        storage.saveUser(userId, name, email, role)
        progress.hide()
        loginButton.isEnabled = true
        (activity as? MainActivity)?.onLoginSuccess(name)
    }

    private fun fail(
        progress: ProgressBar,
        loginButton: MaterialButton,
        status: TextView,
        prefix: String
    ) {
        progress.hide()
        loginButton.isEnabled = true
        status.text = prefix
        status.show()
    }

    companion object {
        fun newInstance() = LoginFragment()
    }
}