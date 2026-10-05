package com.levoy.app.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class User(
    val id: Int,
    val email: String,
    val name: String,
    val phone: String? = null,
    val role: String = "agent",
    val is_active: Boolean = true,
    val created_at: String? = null
) : Parcelable {

    /** Admins and managers see Team / Performance / Quality; agents do not. */
    val isManagerOrAdmin: Boolean
        get() = role.equals("admin", true) || role.equals("manager", true)

    val roleLabel: String
        get() = when (role.lowercase()) {
            "admin" -> "Admin"
            "manager" -> "Manager"
            else -> "Agent"
        }
}

@Parcelize
data class AuthResponse(
    val access_token: String,
    val token_type: String = "bearer",
    val user: User
) : Parcelable

@Parcelize
data class CallEvent(
    val id: Int = 0,
    val phone_number: String,
    val direction: String = "outgoing",
    val status: String = "connected",
    val duration_seconds: Int = 0,
    val timestamp: String,
    val caller_id: String? = null,
    val notes: String? = null,
    val is_pinned: Boolean = false,
    val recording_path: String? = null,
    /** Which app placed the call, when the backend records it. Optional. */
    val source_app: String? = null,
    /** Tag ids attached to this call, when the backend returns them. Optional. */
    val tags: List<Int>? = null
) : Parcelable {
    // Local-only fields (not sent to server)
    var locally_synced: Boolean = false
    var local_id: Long = 0

    val displayName: String
        get() = caller_id?.takeIf { it.isNotBlank() } ?: phone_number

    val directionLabel: String
        get() = when (direction.lowercase()) {
            "incoming" -> "Incoming"
            "outgoing" -> "Outgoing"
            else -> direction.replaceFirstChar { it.uppercase() }
        }

    val statusLabel: String
        get() = when (status.lowercase()) {
            "connected" -> "Connected"
            "missed" -> "Missed"
            "rejected" -> "Rejected"
            "no_answer" -> "No Answer"
            else -> status.replaceFirstChar { it.uppercase() }
        }

    /** True when the caller_id was absent — drives the Saved/Unsaved filter. */
    val isSavedContact: Boolean
        get() = !caller_id.isNullOrBlank()

    /** Null when the backend does not record a source app. */
    val sourceApp: String?
        get() = source_app?.takeIf { it.isNotBlank() }
}

@Parcelize
data class CallEventBatch(
    val events: List<CallEventUpload>
)

@Parcelize
data class CallEventUpload(
    val phone_number: String,
    val direction: String = "outgoing",
    val status: String = "connected",
    val duration_seconds: Int = 0,
    val timestamp: String? = null,
    val caller_id: String? = null,
    val notes: String? = null,
    val is_pinned: Boolean = false,
    val recording_path: String? = null
)

@Parcelize
data class Lead(
    val id: Int = 0,
    val name: String,
    val phone: String,
    val email: String? = null,
    val status: String = "new",
    val source: String? = null,
    val priority: String = "normal",
    val owner_id: Int = 0,
    val assigned_to: Int? = null,
    val notes: String? = null,
    val last_contacted_at: String? = null,
    val created_at: String,
    val updated_at: String
) : Parcelable {

    val statusLabel: String
        get() = when (status.lowercase()) {
            "qualified" -> "Qualified"
            "proposal" -> "Proposal"
            "won", "converted" -> "Won"
            else -> status.replaceFirstChar { it.uppercase() }
        }

    val priorityLabel: String
        get() = priority.replaceFirstChar { it.uppercase() }
}

@Parcelize
data class DashboardStats(
    val total_calls_today: Int = 0,
    val incoming_today: Int = 0,
    val outgoing_today: Int = 0,
    val missed_today: Int = 0,
    val rejected_today: Int = 0,
    val connected_today: Int = 0,
    val total_duration_today: Int = 0,
    val unique_contacts_today: Int = 0,
    val total_calls_all: Int = 0,
    val total_leads: Int = 0,
    val converted_leads: Int = 0,
    val team_members: Int = 0,
    val avg_call_duration: Double = 0.0
) : Parcelable {

    /** connected / total, as a whole percent. 0 when there were no calls. */
    val connectRate: Int
        get() = if (total_calls_today > 0)
            (connected_today * 100 / total_calls_today)
        else 0

    /** True when nothing was recorded — the caller shows an empty state instead. */
    val isEmpty: Boolean
        get() = total_calls_today == 0
}

@Parcelize
data class DailyReportData(
    val date: String,
    val total_calls: Int,
    val incoming: Int,
    val outgoing: Int,
    val missed: Int,
    val rejected: Int,
    val total_duration: Int,
    val unique_contacts: Int
) : Parcelable

// ─── Follow-ups ───
// GET /api/follow-ups/due?scope=today|overdue|upcoming|all returns a bare array
// of these objects. Field names verified against the live backend.

@Parcelize
data class FollowUp(
    val id: Int,
    val lead_id: Int = 0,
    val lead_name: String? = null,
    val lead_phone: String? = null,
    val lead_status: String? = null,
    val user_id: Int? = null,
    val user_name: String? = null,
    val type: String = "call",
    val due_at: String? = null,
    val completed_at: String? = null,
    val outcome: String? = null,
    val notes: String? = null,
    val created_at: String? = null,
    val is_overdue: Boolean = false
) : Parcelable {

    val typeLabel: String
        get() = when (type.lowercase()) {
            "call" -> "Call"
            "meeting" -> "Meeting"
            "whatsapp" -> "WhatsApp"
            else -> "Other"
        }

    val contactName: String
        get() = lead_name?.takeIf { it.isNotBlank() } ?: lead_phone ?: "Unknown"

    val isCompleted: Boolean
        get() = !completed_at.isNullOrBlank()
}

// ─── Agents ───

/** One entry of GET /api/agents/workload -> agents[] */
@Parcelize
data class AgentWorkload(
    val id: Int,
    val name: String,
    val email: String? = null,
    val role: String = "agent",
    val avatar_url: String? = null,
    val open_leads: Int = 0,
    val total_leads: Int = 0,
    val open_follow_ups: Int = 0,
    val calls_today: Int = 0,
    val total_calls: Int = 0,
    val avg_call_duration: Double = 0.0,
    val max_open_leads: Int? = null,
    val effective_capacity: Int = 50,
    val at_capacity: Boolean = false,
    val last_activity: String? = null,
    val last_lead_activity: String? = null,
    val last_call_at: String? = null
) : Parcelable {

    val roleLabel: String
        get() = when (role.lowercase()) {
            "admin" -> "Admin"
            "manager" -> "Manager"
            else -> "Agent"
        }

    /** Load against capacity as a whole percent, clamped to 0..100 for the bar. */
    val capacityPct: Int
        get() {
            val cap = effective_capacity
            return if (cap > 0) ((open_leads * 100) / cap).coerceIn(0, 100) else 0
        }
}

/** GET /api/agents/workload wrapper */
data class WorkloadResponse(
    val scope: String = "all",
    val capacity: Int = 50,
    val generated_at: String? = null,
    val agents: List<AgentWorkload> = emptyList()
)

/** One entry of GET /api/agents/performance -> agents[] */
@Parcelize
data class AgentPerformance(
    val agent_id: Int,
    val name: String,
    val email: String? = null,
    val role: String = "agent",
    val avatar_url: String? = null,
    val total_calls: Int = 0,
    val calls_today: Int = 0,
    val total_leads: Int = 0,
    val open_leads: Int = 0,
    val won_leads: Int = 0,
    val conversion_rate: Double = 0.0,
    val avg_call_duration: Double = 0.0,
    val connect_rate: Double? = null,
    val connected_calls: Int = 0,
    val qa_score: Double? = null,
    val review_count: Int = 0,
    val compliance_violations: Int = 0,
    val period: PerformancePeriod? = null
) : Parcelable {

    val initials: String
        get() = name.trim().split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .map { it.first().uppercaseChar() }
            .joinToString("")
            .ifBlank { "?" }
}

/** Nested period block: the 30d-vs-prior-30d comparison. */
@Parcelize
data class PerformancePeriod(
    val calls_last_30d: Int = 0,
    val calls_prev_30d: Int = 0,
    val calls_change_pct: Double? = null,
    val won_last_30d: Int = 0,
    val won_prev_30d: Int = 0,
    val won_change_pct: Double? = null,
    val qa_last_30d: Double? = null,
    val qa_prev_30d: Double? = null,
    val qa_change: Double? = null
) : Parcelable

/** GET /api/agents/performance wrapper */
data class PerformanceResponse(
    val scope: String = "all",
    val period: PerformanceWindow? = null,
    val agents: List<AgentPerformance> = emptyList()
)

@Parcelize
data class PerformanceWindow(
    val days: Int = 30,
    val current_from: String? = null,
    val previous_from: String? = null,
    val to: String? = null
) : Parcelable

// ─── Quality ───

/** One entry of GET /api/quality/leaderboard -> leaderboard[] */
@Parcelize
data class LeaderboardEntry(
    val rank: Int = 0,
    val agent_id: Int,
    val name: String,
    val email: String? = null,
    val role: String = "agent",
    val avatar_url: String? = null,
    val qa_score: Double? = null,
    val review_count: Int = 0,
    val compliance_violations: Int = 0,
    val total_leads: Int = 0,
    val won_leads: Int = 0,
    val conversion_rate: Double = 0.0,
    val total_calls: Int = 0,
    val connect_rate: Double? = null,
    val reviewed: Boolean = false
) : Parcelable {

    val initials: String
        get() = name.trim().split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .map { it.first().uppercaseChar() }
            .joinToString("")
            .ifBlank { "?" }
}

/** GET /api/quality/leaderboard wrapper */
data class LeaderboardResponse(
    val scope: String = "all",
    val weights: Map<String, Int> = emptyMap(),
    val generated_at: String? = null,
    val leaderboard: List<LeaderboardEntry> = emptyList()
)

/** category_averages[] from GET /api/agents/:id/quality */
@Parcelize
data class QualityCategory(
    val category: String,
    val weight: Int = 0,
    val avg_score: Double = 0.0,
    val ratings: Int = 0,
    val pct_of_max: Double = 0.0
) : Parcelable

/** qa_trend[] — one point per month. */
@Parcelize
data class QualityTrendPoint(
    val period: String,
    val avg_score: Double = 0.0,
    val reviews: Int = 0
) : Parcelable

/** recent_reviews[] */
@Parcelize
data class QualityReview(
    val id: Int = 0,
    val overall_score: Int = 0,
    val is_compliance_violation: Boolean = false,
    val notes: String? = null,
    val reviewer_name: String? = null,
    val created_at: String? = null
) : Parcelable

/** Nested calls{} block. */
@Parcelize
data class QualityCalls(
    val total_calls: Int = 0,
    val calls_today: Int = 0,
    val connected_calls: Int = 0,
    val connect_rate: Double? = null,
    val avg_call_duration: Double = 0.0,
    val last_call_at: String? = null
) : Parcelable

/** Nested leads{} block. */
@Parcelize
data class QualityLeads(
    val total_leads: Int = 0,
    val open_leads: Int = 0,
    val won_leads: Int = 0,
    val lost_leads: Int = 0,
    val conversion_rate: Double = 0.0
) : Parcelable

/** Identity block on the quality payload. */
@Parcelize
data class QualityAgent(
    val id: Int,
    val name: String,
    val email: String? = null,
    val role: String = "agent",
    val avatar_url: String? = null
) : Parcelable

/** GET /api/agents/:id/quality */
@Parcelize
data class AgentQuality(
    val agent: QualityAgent,
    val review_count: Int = 0,
    val qa_score: Double? = null,
    val qa_score_30d: Double? = null,
    val min_qa_score: Int? = null,
    val max_qa_score: Int? = null,
    val compliance_violations: Int = 0,
    val last_review_at: String? = null,
    val qa_trend: List<QualityTrendPoint> = emptyList(),
    val category_averages: List<QualityCategory> = emptyList(),
    val worst_category: String? = null,
    val worst_category_avg: Double? = null,
    val weights: Map<String, Int> = emptyMap(),
    val calls: QualityCalls? = null,
    val leads: QualityLeads? = null,
    val recent_reviews: List<QualityReview> = emptyList()
) : Parcelable {

    /** Categories sorted worst-first: the point of the deep dive is what to fix. */
    val categoriesWorstFirst: List<QualityCategory>
        get() = category_averages.sortedBy { it.avg_score }

    val initials: String
        get() = agent.name.trim().split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .map { it.first().uppercaseChar() }
            .joinToString("")
            .ifBlank { "?" }
}

// ─── Tags / pipeline ───

@Parcelize
data class Tag(
    val id: Int,
    val name: String,
    val color: String? = null,
    val created_at: String? = null,
    val created_by_name: String? = null,
    val lead_count: Int = 0
) : Parcelable

@Parcelize
data class PipelineStage(
    val id: Int,
    val name: String,
    val slug: String? = null,
    val position: Int = 0,
    val color: String? = null,
    val is_won: Boolean = false,
    val is_lost: Boolean = false,
    val probability: Int = 0,
    val created_at: String? = null
) : Parcelable