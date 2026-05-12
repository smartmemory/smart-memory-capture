// Drop into android/app/src/main/java/ai/smartmemory/capture/ShareReceiverPlugin.kt
// after `npx cap add android`. Register in MainActivity.onCreate via:
//
//   registerPlugin(ShareReceiverPlugin::class.java)
//
// Then add the intent-filters in android-patches/AndroidManifest.share-additions.xml
// to <activity android:name=".MainActivity"> in the generated AndroidManifest.xml.
package ai.smartmemory.capture

import android.content.Intent
import android.net.Uri
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream

@CapacitorPlugin(name = "ShareReceiver")
class ShareReceiverPlugin : Plugin() {

    @PluginMethod
    fun getSharedPayload(call: PluginCall) {
        val intent = activity?.intent
        val ret = JSObject()
        if (intent == null) {
            call.resolve(ret)
            return
        }

        val action = intent.action
        val type = intent.type ?: ""

        // Mark consumed so a configuration change or re-launch doesn't
        // re-deliver the same payload. We null the action and remove
        // the relevant extras after reading them.
        when {
            action == Intent.ACTION_SEND && type.startsWith("text/") -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
                if (text != null) ret.put("text", text)
                if (subject != null) ret.put("subject", subject)
                consume(intent, Intent.EXTRA_TEXT, Intent.EXTRA_SUBJECT)
            }

            action == Intent.ACTION_SEND && type.startsWith("image/") -> {
                @Suppress("DEPRECATION")
                val uri: Uri? = intent.getParcelableExtra(Intent.EXTRA_STREAM)
                if (uri != null) {
                    val dataUrl = readImageAsDataUrl(uri, type)
                    if (dataUrl != null) ret.put("imageDataUrl", dataUrl)
                }
                val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
                if (subject != null) ret.put("subject", subject)
                consume(intent, Intent.EXTRA_STREAM, Intent.EXTRA_SUBJECT)
            }

            action == Intent.ACTION_PROCESS_TEXT -> {
                val text = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
                if (text != null) ret.put("text", text)
                consume(intent, Intent.EXTRA_PROCESS_TEXT)
            }
        }

        call.resolve(ret)
    }

    private fun consume(intent: Intent, vararg extras: String) {
        intent.action = null
        for (key in extras) intent.removeExtra(key)
    }

    private fun readImageAsDataUrl(uri: Uri, mime: String): String? {
        return try {
            val resolver = context.contentResolver
            val stream = resolver.openInputStream(uri) ?: return null
            val out = ByteArrayOutputStream()
            stream.use { input ->
                val buf = ByteArray(8 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n <= 0) break
                    out.write(buf, 0, n)
                    // Hard cap at 5 MB to avoid OOM on huge gallery images.
                    // Future: stream-resize via BitmapFactory thumbnail mode.
                    if (out.size() > 5 * 1024 * 1024) return null
                }
            }
            val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            "data:$mime;base64,$b64"
        } catch (e: Exception) {
            null
        }
    }
}
