package com.levoy.app

import com.levoy.app.sync.CallLogReader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The mapping the whole analytics rests on: Android's call types → the server's (direction, status). */
class ClassifyTest {
    @Test fun androidTypesBecomeDirectionAndStatus() {
        assertEquals("incoming" to "connected", CallLogReader.classify(1))
        assertEquals("outgoing" to "connected", CallLogReader.classify(2))
        assertEquals("incoming" to "missed", CallLogReader.classify(3))     // a missed call is INCOMING
        assertEquals("incoming" to "rejected", CallLogReader.classify(5))   // so is a rejected one
        assertEquals("incoming" to "rejected", CallLogReader.classify(6))   // blocked
        assertNull(CallLogReader.classify(4))                               // voicemail is not a call
        assertNull(CallLogReader.classify(99))
    }
}
