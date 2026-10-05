package com.levoy.app.network

import android.content.Context
import android.content.SharedPreferences

class TokenStorage(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("levoy_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_TOKEN = "auth_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USER_NAME = "user_name"
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_USER_ROLE = "user_role"

        @Volatile
        private var instance: TokenStorage? = null

        fun getInstance(context: Context): TokenStorage {
            return instance ?: synchronized(this) {
                instance ?: TokenStorage(context.applicationContext).also { instance = it }
            }
        }
    }

    fun getToken(): String? = prefs.getString(KEY_TOKEN, null)

    fun saveToken(token: String) = prefs.edit().putString(KEY_TOKEN, token).apply()

    fun clearToken() = prefs.edit().remove(KEY_TOKEN).apply()

    /**
     * The role is persisted because nav gating must be decidable on the very
     * first frame after a cold start, before /auth/me has been fetched.
     */
    fun saveUser(userId: Int, name: String, email: String, role: String) {
        prefs.edit()
            .putInt(KEY_USER_ID, userId)
            .putString(KEY_USER_NAME, name)
            .putString(KEY_USER_EMAIL, email)
            .putString(KEY_USER_ROLE, role)
            .apply()
    }

    /** Defaults to "agent" — the most restrictive role, so gating fails closed. */
    fun getUserRole(): String = prefs.getString(KEY_USER_ROLE, "agent") ?: "agent"

    fun getUser(): UserInfo? {
        val id = prefs.getInt(KEY_USER_ID, -1)
        if (id == -1) return null
        return UserInfo(
            id = id,
            name = prefs.getString(KEY_USER_NAME, "Unknown") ?: "Unknown",
            email = prefs.getString(KEY_USER_EMAIL, "") ?: "",
            role = getUserRole()
        )
    }

    fun isLoggedIn(): Boolean = !getToken().isNullOrBlank()

    fun clearAll() = prefs.edit().clear().apply()
}

data class UserInfo(
    val id: Int,
    val name: String,
    val email: String,
    val role: String = "agent"
) {
    val isManagerOrAdmin: Boolean
        get() = role.equals("admin", true) || role.equals("manager", true)
}
