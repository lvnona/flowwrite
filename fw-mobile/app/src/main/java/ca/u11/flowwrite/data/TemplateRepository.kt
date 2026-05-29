package ca.u11.flowwrite.data

import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Real-time listener for [users/{uid}/templates] — the same subcollection the
 * Electron desktop app uses (see src/hooks/useTemplates.js).  Templates created
 * on desktop appear on mobile immediately and vice-versa.
 */
class TemplateRepository {

    private val db = Firebase.firestore

    /**
     * Live-updating list of the user's templates, sorted newest-first by
     * [Template.updatedAt] to match the desktop app's sort order.
     *
     * @param uid  The signed-in user's Firebase UID.
     */
    fun templatesFlow(uid: String): Flow<List<Template>> = callbackFlow {
        val col = db.collection("users").document(uid).collection("templates")

        val reg = col.addSnapshotListener { snap, error ->
            if (error != null) {
                trySend(emptyList())
                return@addSnapshotListener
            }
            val list = snap?.documents
                ?.mapNotNull { doc ->
                    val name = doc.getString("name")?.takeIf { it.isNotBlank() }
                        ?: return@mapNotNull null   // skip unnamed templates
                    Template(
                        id        = doc.id,
                        name      = name,
                        purpose   = doc.getString("purpose")   ?: "",
                        platform  = doc.getString("platform")  ?: "",
                        content   = doc.getString("content")   ?: "",
                        fromName  = doc.getString("fromName")  ?: "",
                        signature = doc.getString("signature") ?: "",
                        notes     = doc.getString("notes")     ?: "",
                        updatedAt = doc.getLong("updatedAt")   ?: 0L,
                        createdAt = doc.getLong("createdAt")   ?: 0L,
                    )
                }
                ?.sortedByDescending { it.updatedAt }   // newest first, matches desktop
                ?: emptyList()
            trySend(list)
        }
        awaitClose { reg.remove() }
    }

    // -----------------------------------------------------------------------
    // Create / update / delete — same schema + ID scheme as the desktop app
    // -----------------------------------------------------------------------

    /**
     * Upserts [template]. If [Template.id] is blank a new id is generated
     * (matching desktop's "tpl-<ts>-<rand>"). Writes updatedAt/createdAt.
     */
    suspend fun saveTemplate(uid: String, template: Template) {
        val now = System.currentTimeMillis()
        val id  = template.id.ifBlank { "tpl-$now-${(0..0xFFFFFF).random().toString(16)}" }
        val data = mapOf(
            "id"        to id,
            "name"      to template.name,
            "purpose"   to template.purpose,
            "platform"  to template.platform,
            "content"   to template.content,
            "fromName"  to template.fromName,
            "signature" to template.signature,
            "notes"     to template.notes,
            "updatedAt" to now,
            "createdAt" to (template.createdAt.takeIf { it > 0 } ?: now),
        )
        db.collection("users").document(uid)
            .collection("templates").document(id)
            .set(data, com.google.firebase.firestore.SetOptions.merge())
            .await()
    }

    suspend fun deleteTemplate(uid: String, id: String) {
        db.collection("users").document(uid)
            .collection("templates").document(id)
            .delete()
            .await()
    }
}
