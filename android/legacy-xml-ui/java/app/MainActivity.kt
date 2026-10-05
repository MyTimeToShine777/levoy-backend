package com.levoy.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.commit
import com.levoy.app.calllog.CallLogTracker
import com.levoy.app.calllog.CallUploadQueue
import com.levoy.app.fragment.CallsFragment
import com.levoy.app.fragment.DashboardFragment
import com.levoy.app.fragment.FollowUpsFragment
import com.levoy.app.fragment.LeadsFragment
import com.levoy.app.fragment.LoginFragment
import com.levoy.app.fragment.MoreSheet
import com.levoy.app.fragment.PerformanceFragment
import com.levoy.app.fragment.QualityFragment
import com.levoy.app.fragment.ReportsFragment
import com.levoy.app.fragment.SettingsFragment
import com.levoy.app.fragment.SimVerificationFragment
import com.levoy.app.fragment.TeamFragment
import com.levoy.app.fragment.TimeFormatFragment
import com.levoy.app.network.TokenStorage
import com.levoy.app.service.CallSyncService
import com.levoy.app.service.CallSyncWorker
import com.levoy.app.settings.AppPreferences

/**
 * Single-Activity host. Five bottom-nav destinations plus a "More" sheet that
 * owns the secondary screens (Reports, Team, Performance, Quality, Settings).
 *
 * Role gating mirrors the web dashboard: Team / Performance / Quality entries
 * are only built for admins and managers, so an agent never sees them — not
 * hidden-and-tappable, simply absent from the sheet.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var toolbar: Toolbar

    private val trackingPermissions = arrayOf(
        Manifest.permission.READ_CALL_LOG,
        Manifest.permission.READ_PHONE_STATE
    )

    private val requestTrackingPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        val allGranted = granted.values.all { it }
        if (allGranted) startTracking() else showPermissionDenied()
    }

    private val requestNotificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* Service runs either way; this only controls its notification. */ }

    /** Bottom-nav destination currently on screen. */
    private var currentTabId: Int = R.id.nav_dashboard

    private val navCells: List<Pair<Int, View>> by lazy {
        listOf(
            R.id.nav_dashboard to findViewById(R.id.nav_dashboard),
            R.id.nav_calls to findViewById(R.id.nav_calls),
            R.id.nav_leads to findViewById(R.id.nav_leads),
            R.id.nav_followups to findViewById(R.id.nav_followups),
            R.id.nav_more to findViewById(R.id.nav_more)
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        toolbar = findViewById(R.id.toolbar)
        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayShowTitleEnabled(true)
        // No up arrow on a root tab; secondary screens turn it on via setSecondary().
        supportActionBar?.setDisplayHomeAsUpEnabled(false)

        setupNavigation()

        if (TokenStorage.getInstance(this).getToken() != null) {
            supportActionBar?.title = TokenStorage.getInstance(this).getUser()?.name ?: getString(R.string.app_name)
            openTab(R.id.nav_dashboard)
        } else {
            showLoginScreen()
        }
    }

    override fun onResume() {
        super.onResume()
        if (TokenStorage.getInstance(this).getToken() != null) refreshCurrentFragment()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        R.id.action_sync -> { syncNow(); true }
        R.id.action_settings -> { openSettings(); true }
        else -> super.onOptionsItemSelected(item)
    }

    override fun onSupportNavigateUp(): Boolean {
        // Back from a secondary screen always lands on a root tab.
        return if (isSecondaryScreen()) {
            openTab(R.id.nav_dashboard)
            true
        } else {
            super.onSupportNavigateUp()
        }
    }

    // ─── Navigation ───

    private fun setupNavigation() {
        navCells.forEach { (id, cell) ->
            cell.setOnClickListener {
                when (id) {
                    R.id.nav_more -> showMoreSheet()
                    else -> openTab(id)
                }
            }
        }
    }

    private fun openTab(tabId: Int) {
        currentTabId = tabId
        supportActionBar?.setDisplayHomeAsUpEnabled(false)
        toolbar.setNavigationOnClickListener(null)
        markSelectedTab(tabId)

        val (fragment, titleRes) = when (tabId) {
            R.id.nav_dashboard -> DashboardFragment.newInstance() to R.string.dashboard
            R.id.nav_calls -> CallsFragment.newInstance() to R.string.call_logs
            R.id.nav_leads -> LeadsFragment.newInstance() to R.string.leads
            R.id.nav_followups -> FollowUpsFragment.newInstance() to R.string.follow_ups
            else -> DashboardFragment.newInstance() to R.string.dashboard
        }
        setTitle(getString(titleRes))
        loadFragment(fragment)
    }

    private fun markSelectedTab(tabId: Int) {
        navCells.forEach { (id, cell) ->
            val selected = id == tabId
            cell.isSelected = selected
            cell.background = if (selected) {
                ContextCompat.getDrawable(this, R.color.accent_dim)
            } else {
                null
            }
        }
    }

    private fun loadFragment(fragment: Fragment) {
        supportFragmentManager.commit {
            replace(R.id.fragment_container, fragment)
        }
    }

    private fun setTitle(title: String) {
        supportActionBar?.title = title
    }

    private fun isSecondaryScreen(): Boolean =
        currentTabId != R.id.nav_dashboard &&
            currentTabId != R.id.nav_calls &&
            currentTabId != R.id.nav_leads &&
            currentTabId != R.id.nav_followups

    /**
     * Opens a screen that is not a bottom-nav tab: the toolbar gains an up
     * arrow and no nav cell is highlighted.
     */
    fun openSecondary(fragment: Fragment, titleRes: Int) {
        currentTabId = R.id.nav_more
        markSelectedTab(R.id.nav_more)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        toolbar.setNavigationOnClickListener { onSupportNavigateUp() }
        setTitle(getString(titleRes))
        loadFragment(fragment)
    }

    /** Used by the dashboard's "View all" action on the recent-calls card. */
    fun openTabCalls() = openTab(R.id.nav_calls)

    private fun showMoreSheet() {
        val sheet = MoreSheet.newInstance()
        sheet.show(supportFragmentManager, MoreSheet.TAG)
    }

    fun openReports() = openSecondary(ReportsFragment.newInstance(), R.string.reports)

    fun openTeam() = openSecondary(TeamFragment.newInstance(), R.string.team)

    fun openPerformance() = openSecondary(PerformanceFragment.newInstance(), R.string.performance)

    fun openQuality(agentId: Int) {
        openSecondary(QualityFragment.newInstance(agentId), R.string.quality)
    }

    fun openSettings() = openSecondary(SettingsFragment.newInstance(), R.string.settings)

    fun openTimeFormat() = openSecondary(TimeFormatFragment.newInstance(), R.string.settings_time_format)

    fun openSimVerification() {
        openSecondary(SimVerificationFragment.newInstance(), R.string.sim_title)
    }

    /** True when the signed-in user may see Team / Performance / Quality. */
    fun currentUserCanSeeTeamTools(): Boolean {
        val role = TokenStorage.getInstance(this).getUserRole()
        return role.equals("admin", true) || role.equals("manager", true)
    }

    fun currentUserName(): String? = TokenStorage.getInstance(this).getUser()?.name

    // ─── Auth flow ───

    private fun showLoginScreen() {
        supportActionBar?.setDisplayHomeAsUpEnabled(false)
        toolbar.setNavigationOnClickListener(null)
        setTitle(getString(R.string.login))
        loadFragment(LoginFragment.newInstance())
    }

    fun onLoginSuccess(userName: String) {
        setTitle(userName)
        openTab(R.id.nav_dashboard)
        requestTrackingPermissionsIfNeeded()
        // Reference flow: offer SIM verification right after the first login.
        if (!AppPreferences.getInstance(this).isSimVerified) {
            openSimVerification()
        }
    }

    private fun requestTrackingPermissionsIfNeeded() {
        val needed = trackingPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (needed.isEmpty()) startTracking()
        else requestTrackingPermissions.launch(needed.toTypedArray())
    }

    private fun refreshCurrentFragment() {
        val current = supportFragmentManager.findFragmentById(R.id.fragment_container)
        when (current) {
            is DashboardFragment -> current.refresh()
            is CallsFragment -> current.refresh()
            is LeadsFragment -> current.refresh()
            is ReportsFragment -> current.refresh()
            is TeamFragment -> current.refresh()
            is FollowUpsFragment -> current.refresh()
            is PerformanceFragment -> current.refresh()
        }
    }

    // ─── Tracking ───

    private fun startTracking() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        CallSyncService.start(this)
        CallSyncWorker.schedule(this)
        CallLogTracker.getInstance(this).startTracking()
        Toast.makeText(this, R.string.tracking_started, Toast.LENGTH_SHORT).show()
    }

    private fun showPermissionDenied() {
        AlertDialog.Builder(this)
            .setTitle(R.string.permission_required)
            .setMessage(R.string.permission_explanation)
            .setPositiveButton(R.string.open_settings) { _, _ ->
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                intent.data = Uri.fromParts("package", packageName, null)
                startActivity(intent)
            }
            .setNegativeButton(android.R.string.cancel) { _, _ -> finish() }
            .show()
    }

    /**
     * Signs out for real: stops the sync service and worker, clears the
     * upload queue and the token, then returns to Login. Device-local
     * settings (time format, quick action) deliberately survive.
     */
    fun logout() {
        AlertDialog.Builder(this)
            .setTitle(R.string.sign_out)
            .setMessage(R.string.settings_logout_confirm)
            .setPositiveButton(R.string.sign_out) { _, _ -> performLogout() }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun performLogout() {
        CallSyncWorker.cancel(this)
        CallSyncService.stop(this)
        runCatching { CallLogTracker.getInstance(this).stopTracking() }
        CallUploadQueue.getInstance(this).clear()
        TokenStorage.getInstance(this).clearAll()

        showLoginScreen()
        Toast.makeText(this, R.string.sign_out, Toast.LENGTH_SHORT).show()
    }

    private fun syncNow() {
        val queued = CallUploadQueue.getInstance(this).size()
        CallSyncService.uploadPending(this)
        val message = if (queued > 0) getString(R.string.queued_calls, queued)
                      else getString(R.string.nothing_queued)
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    companion object {
        /** Convenience for fragments that need a plain short toast. */
        fun toast(host: android.content.Context, message: CharSequence) {
            Toast.makeText(host, message, Toast.LENGTH_SHORT).show()
        }
    }
}