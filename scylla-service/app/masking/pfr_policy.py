"""Owner-approved masking policy for the PFR Scylla keyspace."""

from __future__ import annotations

from types import MappingProxyType
from typing import Mapping

from app.masking.policy import TableMaskingPolicy


PFR_TABLE_POLICIES: Mapping[str, TableMaskingPolicy] = MappingProxyType(
    {
        "account": TableMaskingPolicy(
            visible_fields=frozenset(
                {
                    "investor_profile_id",
                    "link_ref_number",
                    "account_type",
                    "source",
                    "fip_id",
                    "fip_name",
                    "data_provider_id",
                    "data_provider_type",
                    "fnrk_account_id",
                    "masked_acc_number",
                    "masked_folio_no",
                    "masked_demat_id",
                    "account_status",
                    "consent_status",
                    "consent_handle",
                    "consent_types",
                    "consent_start",
                    "consent_expiry",
                    "consent_mode",
                    "fetch_type",
                    "fi_types",
                    "data_life_unit",
                    "data_life_value",
                    "frequency_unit",
                    "frequency_value",
                    "total_fetches_available",
                    "fetches_available_for_ps",
                    "fetches_successful_current_month",
                    "fetch_quota_month",
                    "fetch_latest_date",
                    "fi_data_range_from",
                    "fi_data_range_to",
                    "publish_date_timestamp",
                    "latest_flow_run_status",
                    "latest_raw_data_push_status",
                    "latest_req_id",
                    "latest_request_timestamp",
                    "historical_req_ids",
                    "created_at",
                    "updated_at",
                }
            ),
            json_text_fields=frozenset(
                {
                    "account_holders",
                    "data_consumer",
                    "purpose",
                    "regular_credits",
                    "regular_debits",
                }
            ),
        ),
        "account_holdings": TableMaskingPolicy(
            visible_fields=frozenset(
                {
                    "investor_profile_id",
                    "link_ref_number",
                    "isin",
                    "account_type",
                    "source",
                    "fip_id",
                    "fip_name",
                    "fnrk_account_id",
                    "valued_as_on",
                    "invested_value_as_on",
                    "payout_as_on",
                    "publish_date_timestamp",
                    "created_at",
                    "updated_at",
                }
            ),
            json_text_fields=frozenset(
                {"asset_allocation", "top_underlying_holdings"}
            ),
        ),
        "account_analytics": TableMaskingPolicy(
            visible_fields=frozenset(
                {
                    "investor_profile_id",
                    "analytics_window",
                    "linked_acc_ref",
                    "account_type",
                    "source",
                    "mf_investment_account",
                    "publish_date_timestamp",
                    "data_expiry",
                    "created_at",
                    "updated_at",
                }
            ),
            json_text_fields=frozenset(
                {
                    "category_credits",
                    "category_debits",
                    "spending_distribution",
                    "holdings",
                }
            ),
        ),
        "transactions": TableMaskingPolicy(
            visible_fields=frozenset(
                {
                    "investor_profile_id",
                    "transaction_timestamp",
                    "fnrk_txn_id",
                    "txn_id",
                    "linked_acc_ref",
                    "account_type",
                    "source",
                    "type",
                    "mode",
                    "fip_id",
                    "fnrk_account_id",
                    "masked_acc_number",
                    "masked_demat_id",
                    "masked_folio_no",
                    "value_date",
                    "nav_date",
                    "index",
                    "publish_date_timestamp",
                    "data_expiry",
                    "created_at",
                    "updated_at",
                }
            )
        ),
        "liabilities": TableMaskingPolicy(
            visible_fields=frozenset(
                {
                    "investor_profile_id",
                    "loan_type",
                    "publish_date_timestamp",
                    "created_at",
                    "updated_at",
                }
            )
        ),
        "migrations": TableMaskingPolicy(reveal_all=True),
    }
)
