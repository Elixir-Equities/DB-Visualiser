"""Selective masking policy for the configured chat-history table."""

from app.masking.policy import TableMaskingPolicy


CH_TABLE_POLICY = TableMaskingPolicy(
    masked_fields=frozenset(
        {
            "message_text",
            "translated_message_text",
        }
    )
)
