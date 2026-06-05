package ca.u11.flowwrite.data

import ca.u11.flowwrite.auth.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Calls the FlowWrite SERVER PROXY — never an AI provider directly.
 *
 * The proxy (flowwrite.u11.ca) holds the API keys, enforces per-user weekly
 * limits, and records usage. This app:
 *   - builds the prompt string client-side ([PromptBuilder]),
 *   - sends it to api-generate.php / api-transcribe.php with the user's
 *     Firebase ID token as a Bearer credential,
 *   - shows the result, and surfaces the upgrade screen on a 402.
 *
 * The app never reads provider keys and never contacts an AI provider directly —
 * the proxy is the only network destination for AI work.
 */
class ApiClient(private val auth: AuthRepository) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    // -----------------------------------------------------------------------
    // Result types
    // -----------------------------------------------------------------------

    data class TranscribeResult(val text: String, val words: Int)
    data class GenerateResult(val text: String)

    // -----------------------------------------------------------------------
    // Text generation → api-generate.php
    // -----------------------------------------------------------------------

    /**
     * Sends the already-built [prompt] to the proxy. The caller keeps doing all
     * prompt building (templates, tone, length, additionalInstructions, …) —
     * this just transmits the final string.
     */
    suspend fun generate(prompt: String): GenerateResult = withContext(Dispatchers.IO) {
        val token = idTokenOrThrow()
        val body = JSONObject().put("prompt", prompt).toString()
            .toRequestBody("application/json".toMediaType())

        val req = Request.Builder()
            .url("$BASE/api-generate.php")
            .header("Authorization", "Bearer $token")
            .post(body)
            .build()

        val (code, raw) = execute(req)
        val json = raw.toJsonOrNull()

        when (code) {
            200  -> GenerateResult(json?.optString("text").orEmpty())
            402  -> throw limitReached(json, defaultKind = "generations")
            401  -> throw ApiException("Session expired — please reopen FlowWrite.")
            403  -> throw ApiException("Your account is suspended.")
            else -> throw ApiException(serverError(json, code))
        }
    }

    // -----------------------------------------------------------------------
    // Voice transcription → api-transcribe.php
    // -----------------------------------------------------------------------

    /**
     * Uploads [audioFile] to the proxy for transcription (+server-side polish).
     */
    suspend fun transcribe(audioFile: File, mimeType: String = "audio/mp4"): TranscribeResult =
        withContext(Dispatchers.IO) {
            val token = idTokenOrThrow()
            val multipart = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("audio", audioFile.name, audioFile.asRequestBody(mimeType.toMediaType()))
                .addFormDataPart("polish", "1")
                .build()

            val req = Request.Builder()
                .url("$BASE/api-transcribe.php")
                .header("Authorization", "Bearer $token")
                .post(multipart)
                .build()

            val (code, raw) = execute(req)
            val json = raw.toJsonOrNull()

            when (code) {
                200  -> TranscribeResult(
                    text  = json?.optString("text").orEmpty(),
                    words = json?.optInt("words") ?: 0,
                )
                402  -> throw limitReached(json, defaultKind = "audioWords")
                401  -> throw ApiException("Session expired — please reopen FlowWrite.")
                403  -> throw ApiException("Your account is suspended.")
                else -> throw ApiException(serverError(json, code))
            }
        }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private suspend fun idTokenOrThrow(): String =
        auth.getIdToken(false) ?: throw ApiException("Not signed in — please reopen FlowWrite.")

    /** Returns (httpCode, bodyString). */
    private fun execute(req: Request): Pair<Int, String> {
        val resp = http.newCall(req).execute()
        val text = resp.body?.string().orEmpty()
        return resp.code to text
    }

    private fun String.toJsonOrNull(): JSONObject? =
        try { if (isBlank()) null else JSONObject(this) } catch (_: Exception) { null }

    private fun limitReached(json: JSONObject?, defaultKind: String): LimitReachedException =
        LimitReachedException(
            kind  = json?.optString("limitReached")?.ifBlank { defaultKind } ?: defaultKind,
            used  = json?.optInt("used")  ?: 0,
            limit = json?.optInt("limit") ?: 0,
        )

    private fun serverError(json: JSONObject?, code: Int): String =
        json?.optString("error")?.ifBlank { null } ?: "Server error ($code). Please try again."

    // -----------------------------------------------------------------------
    // Exceptions
    // -----------------------------------------------------------------------

    class ApiException(message: String) : Exception(message)

    /** Thrown on HTTP 402 — the user hit a free-plan weekly limit. */
    class LimitReachedException(
        val kind: String,    // "generations" | "audioWords"
        val used: Int,
        val limit: Int,
    ) : Exception("limit_reached")

    companion object {
        private const val BASE = "https://flowwrite.u11.ca"
    }
}
