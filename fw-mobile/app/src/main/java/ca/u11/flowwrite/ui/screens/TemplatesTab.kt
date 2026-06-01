package ca.u11.flowwrite.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import ca.u11.flowwrite.MainViewModel
import ca.u11.flowwrite.data.Template
import ca.u11.flowwrite.data.WebPortal

private val PURPOSE_ORDER = listOf("Post", "Message", "Email", "Bio", "Description", "Note", "Other")
// Purposes a user can choose for a template (Translate never uses a template).
private val EDITABLE_PURPOSES = listOf("Message", "Post", "Email", "Bio", "Description", "Note", "Other")

/**
 * Browse, create, edit and delete templates (stored at users/{uid}/templates,
 * shared with the desktop app). Templates are *applied* over other apps via the
 * bubble long-press, where the user's field text becomes the topic.
 */
@Composable
fun TemplatesTab(vm: MainViewModel, innerPadding: PaddingValues) {
    val templates by vm.templates.collectAsState()

    var selectedPurpose by remember { mutableStateOf<String?>(null) }   // null = All
    var editing by remember { mutableStateOf<Template?>(null) }          // non-null = editor open

    val purposes = remember(templates) {
        val present = templates.map { it.purpose.ifBlank { "Other" } }.distinct()
        PURPOSE_ORDER.filter { it in present } + present.filter { it !in PURPOSE_ORDER }
    }
    val visible = remember(templates, selectedPurpose) {
        if (selectedPurpose == null) templates
        else templates.filter { it.purpose.ifBlank { "Other" } == selectedPurpose }
    }

    // Editor dialog (create or edit)
    editing?.let { tpl ->
        TemplateEditorDialog(
            initial   = tpl,
            onDismiss = { editing = null },
            onSave    = { vm.saveTemplate(it); editing = null },
            onDelete  = if (tpl.id.isNotBlank()) {
                { vm.deleteTemplate(tpl.id); editing = null }
            } else null,
        )
    }

    val context = LocalContext.current

    Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            // 🌐 Web portal banner — quicker editing on a bigger screen
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 10.dp)
                    .clickable { WebPortal.open(context) },
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                ),
                shape = RoundedCornerShape(14.dp),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Filled.Language, null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.size(22.dp),
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Edit templates online",
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                        )
                        Text(
                            "Bigger screen, syncs instantly",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f),
                        )
                    }
                    Icon(
                        Icons.AutoMirrored.Filled.OpenInNew, null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }

            // Header: hint + New button
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Info, null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    "Long-press the bubble in any app to apply a template.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Button(
                    onClick = { editing = Template(purpose = selectedPurpose ?: "Message") },
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                ) {
                    Icon(Icons.Filled.Add, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("New")
                }
            }

            if (templates.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Filled.AutoFixHigh, null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f))
                        Spacer(Modifier.height(12.dp))
                        Text("No templates yet",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(4.dp))
                        Text("Tap “New” to create one, or add them on desktop",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f))
                    }
                }
                return@Column
            }

            // Category chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = selectedPurpose == null,
                    onClick  = { selectedPurpose = null },
                    label    = { Text("All (${templates.size})") },
                )
                purposes.forEach { p ->
                    val count = templates.count { it.purpose.ifBlank { "Other" } == p }
                    FilterChip(
                        selected = selectedPurpose == p,
                        onClick  = { selectedPurpose = p },
                        label    = { Text("$p ($count)") },
                    )
                }
            }

            LazyColumn(
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(visible, key = { it.id }) { t ->
                    TemplateCard(template = t, onClick = { editing = t })
                }
                item { Spacer(Modifier.height(8.dp)) }
            }
    }
}

@Composable
private fun TemplateCard(template: Template, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick  = onClick,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        ),
        shape = RoundedCornerShape(16.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    template.name.ifBlank { "(untitled)" },
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                if (template.purpose.isNotBlank()) {
                    Text(template.purpose,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary)
                }
            }
            if (template.platform.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(template.platform,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (template.content.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(template.content,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2)
            }
        }
    }
}

/**
 * Create / edit a template. [initial] with a blank id means "create".
 * [onDelete] is null for new templates.
 */
@Composable
private fun TemplateEditorDialog(
    initial: Template,
    onDismiss: () -> Unit,
    onSave: (Template) -> Unit,
    onDelete: (() -> Unit)?,
) {
    var name                   by remember { mutableStateOf(initial.name) }
    var purpose                by remember { mutableStateOf(initial.purpose.ifBlank { "Message" }) }
    var platform               by remember { mutableStateOf(initial.platform) }
    var content                by remember { mutableStateOf(initial.content) }
    var fromName               by remember { mutableStateOf(initial.fromName) }
    var signature              by remember { mutableStateOf(initial.signature) }
    var notes                  by remember { mutableStateOf(initial.notes) }
    var additionalInstructions by remember { mutableStateOf(initial.additionalInstructions) }

    val isEmail = purpose == "Email"
    // Match desktop: emails need a signature; everything else needs a style example.
    val canSave = name.isNotBlank() && (if (isEmail) signature.isNotBlank() else content.isNotBlank())

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id.isBlank()) "New template" else "Edit template") },
        text = {
            Column(
                Modifier
                    .heightIn(max = 560.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    value = name, onValueChange = { name = it },
                    label = { Text("Name") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                Text("Type", style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    EDITABLE_PURPOSES.forEach { p ->
                        FilterChip(
                            selected = purpose == p,
                            onClick  = { purpose = p },
                            label    = { Text(p) },
                        )
                    }
                }

                OutlinedTextField(
                    value = platform, onValueChange = { platform = it },
                    label = { Text("Platform (optional)") },
                    placeholder = { Text("e.g. LinkedIn, Gmail") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )

                OutlinedTextField(
                    value = content, onValueChange = { content = it },
                    label = { Text(if (isEmail) "Example email (optional)" else "Style example / content") },
                    placeholder = { Text("Paste an example written in the style you want…") },
                    minLines = 4, modifier = Modifier.fillMaxWidth().height(140.dp),
                )

                if (isEmail) {
                    OutlinedTextField(
                        value = fromName, onValueChange = { fromName = it },
                        label = { Text("From name (optional)") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = signature, onValueChange = { signature = it },
                        label = { Text("Signature *") },
                        placeholder = { Text("Appended verbatim to every generated email") },
                        minLines = 2, modifier = Modifier.fillMaxWidth(),
                    )
                }

                // Additional instructions — HIGHEST-PRIORITY rules added to every
                // generation from this template (names, numbers, must-include phrases…).
                OutlinedTextField(
                    value = additionalInstructions,
                    onValueChange = { additionalInstructions = it },
                    label = { Text("Additional instructions (optional)") },
                    placeholder = {
                        Text("Names, phone numbers, custom phrases — copied verbatim every time")
                    },
                    minLines = 2, modifier = Modifier.fillMaxWidth().height(110.dp),
                )

                // Private notes — never sent to the AI, just for the user.
                OutlinedTextField(
                    value = notes, onValueChange = { notes = it },
                    label = { Text("Notes (optional, private)") },
                    placeholder = { Text("Reminders for yourself") },
                    minLines = 2, modifier = Modifier.fillMaxWidth().height(90.dp),
                )

                if (onDelete != null) {
                    TextButton(
                        onClick = onDelete,
                        modifier = Modifier.align(Alignment.Start),
                    ) {
                        Icon(Icons.Filled.Delete, null, modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(6.dp))
                        Text("Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(
                        initial.copy(
                            name = name.trim(),
                            purpose = purpose,
                            platform = platform.trim(),
                            content = content,
                            fromName = fromName.trim(),
                            signature = signature.trim(),
                            notes = notes.trim(),
                            additionalInstructions = additionalInstructions.trim(),
                        )
                    )
                },
                enabled = canSave,
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
