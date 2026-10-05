package com.levoy.app.network

import android.content.Context
import android.util.Log
import com.levoy.app.BuildConfig
import com.levoy.app.model.AgentPerformance
import com.levoy.app.model.AgentQuality
import com.levoy.app.model.AuthResponse
import com.levoy.app.model.CallEvent
import com.levoy.app.model.CallEventUpload
import com.levoy.app.model.DailyReportData
import com.levoy.app.model.DashboardStats
import com.levoy.app.model.FollowUp
import com.levoy.app.model.Lead
import com.levoy.app.model.LeaderboardResponse
import com.levoy.app.model.PerformanceResponse
import com.levoy.app.model.PipelineStage
import com.levoy.app.model.Tag
import com.levoy.app.model.User
import com.levoy.app.model.WorkloadResponse
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.util.concurrent.TimeUnit

class ApiClient(context: Context) {

    private val gson: Gson = GsonBuilder().setDateFormat("yyyy-MM-dd'T'HH:mm:ss").create()
    private val baseUrl: String = BuildConfig.API_BASE_URL

    private val authInterceptor = Interceptor { chain ->
        val token = TokenStorage.getInstance(context).getToken()
        val request = chain.request().newBuilder()
        if (token != null) {
            request.addHeader("Authorization", "Bearer $token")
        }
        chain.proceed(request.build())
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(authInterceptor)
        .addInterceptor(LoggingInterceptor())
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    // ─── Auth ───

    fun login(email: String, password: String): Result<AuthResponse> {
        return executeRequest<AuthResponse>(
            "POST",
            "/auth/login",
            mapOf("email" to email, "password" to password)
        )
    }

    fun register(email: String, password: String, name: String, phone: String? = null): Result<AuthResponse> {
        val body = mutableMapOf<String, Any>("email" to email, "password" to password, "name" to name)
        phone?.let { body["phone"] = it }
        return executeRequest<AuthResponse>("POST", "/auth/register", body)
    }

    fun getMe(): Result<User> {
        return executeRequest<User>("GET", "/auth/me")
    }

    // ─── Calls ───

    fun uploadCallBatch(events: List<CallEventUpload>): Result<Map<String, Any>> {
        val body = mapOf<String, Any>("events" to events)
        return executeRequest<Map<String, Any>>("POST", "/calls/batch", body)
    }

    /**
     * Call history. [source], [contactType] and [tags] are app-side refinements:
     * the backend has no such query params, so CallsFragment filters those on
     * the page it fetched. Everything else maps onto a real query param.
     */
    fun getCalls(limit: Int = 100, offset: Int = 0, direction: String? = null,
                 status: String? = null, phone: String? = null,
                 dateFrom: String? = null, dateTo: String? = null,
                 pinned: Boolean? = null): Result<List<CallEvent>> {
        val params = mutableMapOf<String, String>(
            "limit" to limit.toString(),
            "offset" to offset.toString()
        )
        direction?.let { params["direction"] = it }
        status?.let { params["status"] = it }
        phone?.let { params["phone"] = it }
        dateFrom?.let { params["date_from"] = it }
        dateTo?.let { params["date_to"] = it }
        if (pinned != null) params["pinned"] = pinned.toString()
        return executeRequest<List<CallEvent>>("GET", "/calls?${encodeQuery(params)}")
    }

    fun getStats(): Result<DashboardStats> {
        return executeRequest<DashboardStats>("GET", "/calls/stats")
    }

    fun togglePin(callId: Int, pinned: Boolean): Result<Map<String, Any>> {
        return executeRequest<Map<String, Any>>("PUT", "/calls/$callId/pin?pinned=$pinned", emptyMap())
    }

    fun updateCallNotes(callId: Int, notes: String): Result<Map<String, Any>> {
        return executeRequest<Map<String, Any>>("PUT", "/calls/$callId/notes", mapOf("notes" to notes))
    }

    // ─── Leads ───

    fun createLead(lead: Lead): Result<Lead> {
        val body = mapOf<String, Any>(
            "name" to lead.name,
            "phone" to lead.phone,
            "email" to (lead.email ?: ""),
            "status" to lead.status,
            "source" to (lead.source ?: ""),
            "priority" to lead.priority,
            "notes" to (lead.notes ?: ""),
            "assigned_to" to (lead.assigned_to ?: -1).toString()
        )
        return executeRequest<Lead>("POST", "/leads", body)
    }

    fun getLeads(status: String? = null, priority: String? = null,
                 search: String? = null, limit: Int = 200, offset: Int = 0): Result<List<Lead>> {
        val params = mutableMapOf<String, String>("limit" to limit.toString(), "offset" to offset.toString())
        status?.let { params["status"] = it }
        priority?.let { params["priority"] = it }
        search?.let { params["search"] = it }
        return executeRequest<List<Lead>>("GET", "/leads?${encodeQuery(params)}")
    }

    fun getLead(id: Int): Result<Lead> {
        return executeRequest<Lead>("GET", "/leads/$id")
    }

    fun updateLead(id: Int, lead: Lead): Result<Lead> {
        val body = mapOf<String, Any>(
            "name" to lead.name,
            "phone" to lead.phone,
            "email" to (lead.email ?: ""),
            "status" to lead.status,
            "source" to (lead.source ?: ""),
            "priority" to lead.priority,
            "notes" to (lead.notes ?: "")
        )
        return executeRequest<Lead>("PUT", "/leads/$id", body)
    }

    fun markLeadContacted(id: Int): Result<Map<String, Any>> {
        return executeRequest<Map<String, Any>>("POST", "/leads/$id/contact", emptyMap())
    }

    // ─── Follow-ups ───

    /** scope: today | overdue | upcoming | all */
    fun getFollowUps(scope: String = "today"): Result<List<FollowUp>> {
        return executeRequest<List<FollowUp>>("GET", "/follow-ups/due?scope=$scope")
    }

    /** PATCH body: any subset of status, due_at, notes, outcome. */
    fun updateFollowUp(id: Int, body: Map<String, Any>): Result<Map<String, Any>> {
        return executeRequest<Map<String, Any>>("PATCH", "/follow-ups/$id", body)
    }

    // ─── Reports ───

    fun getDailyReports(days: Int = 30): Result<List<DailyReportData>> {
        return executeRequest<List<DailyReportData>>("GET", "/reports/daily?days=$days")
    }

    fun generateReport(): Result<Map<String, Any>> {
        return executeRequest<Map<String, Any>>("POST", "/reports/generate-email", emptyMap())
    }

    // ─── Team ───

    fun getUsers(): Result<List<User>> {
        return executeRequest<List<User>>("GET", "/users")
    }

    fun updateUserRole(userId: Int, role: String): Result<Map<String, Any>> {
        return executeRequest<Map<String, Any>>("POST", "/users/$userId/role?role=$role", emptyMap())
    }

    /** GET /api/agents/workload -> {scope, capacity, agents:[...]} */
    fun getAgentWorkload(scope: String = "all"): Result<WorkloadResponse> {
        return executeRequest<WorkloadResponse>("GET", "/agents/workload?scope=$scope")
    }

    /** GET /api/agents/performance -> {scope, period, agents:[...]} */
    fun getAgentPerformance(days: Int = 30): Result<PerformanceResponse> {
        return executeRequest<PerformanceResponse>("GET", "/agents/performance?days=$days")
    }

    /** GET /api/agents/:id/quality -> QA deep dive for one agent. */
    fun getAgentQuality(agentId: Int): Result<AgentQuality> {
        return executeRequest<AgentQuality>("GET", "/agents/$agentId/quality")
    }

    /** GET /api/quality/leaderboard -> {scope, weights, leaderboard:[...]} */
    fun getLeaderboard(): Result<LeaderboardResponse> {
        return executeRequest<LeaderboardResponse>("GET", "/quality/leaderboard")
    }

    // ─── Tags / pipeline ───

    fun getTags(): Result<List<Tag>> {
        return executeRequest<List<Tag>>("GET", "/tags")
    }

    fun getPipelineStages(): Result<List<PipelineStage>> {
        return executeRequest<List<PipelineStage>>("GET", "/pipeline/stages")
    }

    // ─── Helpers ───

    private fun encodeQuery(params: Map<String, String>): String =
        params.entries.joinToString("&") { (k, v) ->
            "${java.net.URLEncoder.encode(k, "UTF-8")}=${java.net.URLEncoder.encode(v, "UTF-8")}"
        }

    /**
     * T must be reified so Gson's TypeToken can preserve the full generic type
     * (e.g. List<CallEvent>) instead of degrading it to a raw List.
     */
    private inline fun <reified T> executeRequest(
        method: String,
        endpoint: String,
        body: Map<String, Any>? = null
    ): Result<T> {
        return try {
            runBlocking(Dispatchers.IO) {
                val jsonMediaType = "application/json; charset=utf-8".toMediaType()

                // OkHttp rejects POST/PUT/PATCH without a body, so send an empty JSON object.
                val requiresBody = method in setOf("POST", "PUT", "PATCH")
                val requestBody: RequestBody? = when {
                    body != null -> gson.toJson(body).toRequestBody(jsonMediaType)
                    requiresBody -> "{}".toRequestBody(jsonMediaType)
                    else -> null
                }

                val request = Request.Builder()
                    .url("$baseUrl$endpoint")
                    .method(method, requestBody)
                    .build()

                client.newCall(request).execute().use { response ->
                    val responseBody = response.body?.string()
                    if (response.isSuccessful) {
                        if (responseBody.isNullOrBlank()) {
                            // 204 / empty 2xx — nothing to decode.
                            Result.failure(ApiException("Empty response from server"))
                        } else {
                            Result.success(gson.fromJson(responseBody, T::class.java))
                        }
                    } else {
                        val detail = extractErrorDetail(responseBody)
                        Result.failure(ApiException(detail, response.code))
                    }
                }
            }
        } catch (e: Exception) {
            val msg = e.message?.takeIf { it.isNotBlank() }
                ?: e.localizedMessage?.takeIf { it.isNotBlank() }
                ?: e.javaClass.simpleName.ifEmpty { "Network request failed" }
            Result.failure(Exception(msg, e))
        }
    }

    private fun extractErrorDetail(errorBody: String?): String {
        if (errorBody.isNullOrBlank()) return "Server error"
        return try {
            val map = gson.fromJson(errorBody, Map::class.java)
            when (val detail = map?.get("detail")) {
                is String -> detail
                is List<*> -> detail.joinToString(", ")
                else -> (map?.get("message") as? String) ?: errorBody
            }
        } catch (e: Exception) {
            errorBody
        }
    }

}

class ApiException(message: String, val code: Int = -1) : Exception(message)

class LoggingInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        Log.d(TAG, "${request.method} ${request.url}")
        val startTime = System.currentTimeMillis()
        val response = chain.proceed(request)
        val elapsed = System.currentTimeMillis() - startTime
        Log.d(TAG, "${response.code} in ${elapsed}ms")
        return response
    }

    companion object {
        private const val TAG = "LevoyApi"
    }
}