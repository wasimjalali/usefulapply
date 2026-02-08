[
  {
    "schema_name": "auth",
    "table_name": "audit_log_entries",
    "ordinal_position": 1,
    "column_name": "instance_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "audit_log_entries",
    "ordinal_position": 2,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "audit_log_entries",
    "ordinal_position": 3,
    "column_name": "payload",
    "data_type": "json",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "audit_log_entries",
    "ordinal_position": 4,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "audit_log_entries",
    "ordinal_position": 5,
    "column_name": "ip_address",
    "data_type": "character varying(64)",
    "is_nullable": false,
    "column_default": "''::character varying",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 3,
    "column_name": "auth_code",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 4,
    "column_name": "code_challenge_method",
    "data_type": "auth.code_challenge_method",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 5,
    "column_name": "code_challenge",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 6,
    "column_name": "provider_type",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 7,
    "column_name": "provider_access_token",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 8,
    "column_name": "provider_refresh_token",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 9,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 10,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 11,
    "column_name": "authentication_method",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 12,
    "column_name": "auth_code_issued_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 13,
    "column_name": "invite_token",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 14,
    "column_name": "referrer",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 15,
    "column_name": "oauth_client_state_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 16,
    "column_name": "linking_target_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "flow_state",
    "ordinal_position": 17,
    "column_name": "email_optional",
    "data_type": "boolean",
    "is_nullable": false,
    "column_default": "false",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "identities",
    "ordinal_position": 1,
    "column_name": "provider_id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "identities",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "identities",
    "ordinal_position": 3,
    "column_name": "identity_data",
    "data_type": "jsonb",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "identities",
    "ordinal_position": 4,
    "column_name": "provider",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "identities",
    "ordinal_position": 5,
    "column_name": "last_sign_in_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "identities",
    "ordinal_position": 6,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "identities",
    "ordinal_position": 7,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "identities",
    "ordinal_position": 8,
    "column_name": "email",
    "data_type": "text",
    "is_nullable": true,
    "column_default": "lower((identity_data ->> 'email'::text))",
    "column_comment": "Auth: Email is a generated column that references the optional email property in the identity_data"
  },
  {
    "schema_name": "auth",
    "table_name": "identities",
    "ordinal_position": 9,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "instances",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "instances",
    "ordinal_position": 2,
    "column_name": "uuid",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "instances",
    "ordinal_position": 3,
    "column_name": "raw_base_config",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "instances",
    "ordinal_position": 4,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "instances",
    "ordinal_position": 5,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_amr_claims",
    "ordinal_position": 1,
    "column_name": "session_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_amr_claims",
    "ordinal_position": 2,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_amr_claims",
    "ordinal_position": 3,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_amr_claims",
    "ordinal_position": 4,
    "column_name": "authentication_method",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_amr_claims",
    "ordinal_position": 5,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_challenges",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_challenges",
    "ordinal_position": 2,
    "column_name": "factor_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_challenges",
    "ordinal_position": 3,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_challenges",
    "ordinal_position": 4,
    "column_name": "verified_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_challenges",
    "ordinal_position": 5,
    "column_name": "ip_address",
    "data_type": "inet",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_challenges",
    "ordinal_position": 6,
    "column_name": "otp_code",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_challenges",
    "ordinal_position": 7,
    "column_name": "web_authn_session_data",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 3,
    "column_name": "friendly_name",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 4,
    "column_name": "factor_type",
    "data_type": "auth.factor_type",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 5,
    "column_name": "status",
    "data_type": "auth.factor_status",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 6,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 7,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 8,
    "column_name": "secret",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 9,
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 10,
    "column_name": "last_challenged_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 11,
    "column_name": "web_authn_credential",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 12,
    "column_name": "web_authn_aaguid",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "mfa_factors",
    "ordinal_position": 13,
    "column_name": "last_webauthn_challenge_data",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": "Stores the latest WebAuthn challenge data including attestation/assertion for customer verification"
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 2,
    "column_name": "authorization_id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 3,
    "column_name": "client_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 4,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 5,
    "column_name": "redirect_uri",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 6,
    "column_name": "scope",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 7,
    "column_name": "state",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 8,
    "column_name": "resource",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 9,
    "column_name": "code_challenge",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 10,
    "column_name": "code_challenge_method",
    "data_type": "auth.code_challenge_method",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 11,
    "column_name": "response_type",
    "data_type": "auth.oauth_response_type",
    "is_nullable": false,
    "column_default": "'code'::auth.oauth_response_type",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 12,
    "column_name": "status",
    "data_type": "auth.oauth_authorization_status",
    "is_nullable": false,
    "column_default": "'pending'::auth.oauth_authorization_status",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 13,
    "column_name": "authorization_code",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 14,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 15,
    "column_name": "expires_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "(now() + '00:03:00'::interval)",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 16,
    "column_name": "approved_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_authorizations",
    "ordinal_position": 17,
    "column_name": "nonce",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_client_states",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_client_states",
    "ordinal_position": 2,
    "column_name": "provider_type",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_client_states",
    "ordinal_position": 3,
    "column_name": "code_verifier",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_client_states",
    "ordinal_position": 4,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 3,
    "column_name": "client_secret_hash",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 4,
    "column_name": "registration_type",
    "data_type": "auth.oauth_registration_type",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 5,
    "column_name": "redirect_uris",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 6,
    "column_name": "grant_types",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 7,
    "column_name": "client_name",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 8,
    "column_name": "client_uri",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 9,
    "column_name": "logo_uri",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 10,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 11,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 12,
    "column_name": "deleted_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 13,
    "column_name": "client_type",
    "data_type": "auth.oauth_client_type",
    "is_nullable": false,
    "column_default": "'confidential'::auth.oauth_client_type",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_clients",
    "ordinal_position": 14,
    "column_name": "token_endpoint_auth_method",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_consents",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_consents",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_consents",
    "ordinal_position": 3,
    "column_name": "client_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_consents",
    "ordinal_position": 4,
    "column_name": "scopes",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_consents",
    "ordinal_position": 5,
    "column_name": "granted_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "oauth_consents",
    "ordinal_position": 6,
    "column_name": "revoked_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "one_time_tokens",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "one_time_tokens",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "one_time_tokens",
    "ordinal_position": 3,
    "column_name": "token_type",
    "data_type": "auth.one_time_token_type",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "one_time_tokens",
    "ordinal_position": 4,
    "column_name": "token_hash",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "one_time_tokens",
    "ordinal_position": 5,
    "column_name": "relates_to",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "one_time_tokens",
    "ordinal_position": 6,
    "column_name": "created_at",
    "data_type": "timestamp without time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "one_time_tokens",
    "ordinal_position": 7,
    "column_name": "updated_at",
    "data_type": "timestamp without time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "refresh_tokens",
    "ordinal_position": 1,
    "column_name": "instance_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "refresh_tokens",
    "ordinal_position": 2,
    "column_name": "id",
    "data_type": "bigint",
    "is_nullable": false,
    "column_default": "nextval('auth.refresh_tokens_id_seq'::regclass)",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "refresh_tokens",
    "ordinal_position": 3,
    "column_name": "token",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "refresh_tokens",
    "ordinal_position": 4,
    "column_name": "user_id",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "refresh_tokens",
    "ordinal_position": 5,
    "column_name": "revoked",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "refresh_tokens",
    "ordinal_position": 6,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "refresh_tokens",
    "ordinal_position": 7,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "refresh_tokens",
    "ordinal_position": 8,
    "column_name": "parent",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "refresh_tokens",
    "ordinal_position": 9,
    "column_name": "session_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_providers",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_providers",
    "ordinal_position": 2,
    "column_name": "sso_provider_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_providers",
    "ordinal_position": 3,
    "column_name": "entity_id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_providers",
    "ordinal_position": 4,
    "column_name": "metadata_xml",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_providers",
    "ordinal_position": 5,
    "column_name": "metadata_url",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_providers",
    "ordinal_position": 6,
    "column_name": "attribute_mapping",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_providers",
    "ordinal_position": 7,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_providers",
    "ordinal_position": 8,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_providers",
    "ordinal_position": 9,
    "column_name": "name_id_format",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_relay_states",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_relay_states",
    "ordinal_position": 2,
    "column_name": "sso_provider_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_relay_states",
    "ordinal_position": 3,
    "column_name": "request_id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_relay_states",
    "ordinal_position": 4,
    "column_name": "for_email",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_relay_states",
    "ordinal_position": 5,
    "column_name": "redirect_to",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_relay_states",
    "ordinal_position": 7,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_relay_states",
    "ordinal_position": 8,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "saml_relay_states",
    "ordinal_position": 9,
    "column_name": "flow_state_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "schema_migrations",
    "ordinal_position": 1,
    "column_name": "version",
    "data_type": "character varying(255)",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 3,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 4,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 5,
    "column_name": "factor_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 6,
    "column_name": "aal",
    "data_type": "auth.aal_level",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 7,
    "column_name": "not_after",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": "Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired."
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 8,
    "column_name": "refreshed_at",
    "data_type": "timestamp without time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 9,
    "column_name": "user_agent",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 10,
    "column_name": "ip",
    "data_type": "inet",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 11,
    "column_name": "tag",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 12,
    "column_name": "oauth_client_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 13,
    "column_name": "refresh_token_hmac_key",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": "Holds a HMAC-SHA256 key used to sign refresh tokens for this session."
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 14,
    "column_name": "refresh_token_counter",
    "data_type": "bigint",
    "is_nullable": true,
    "column_default": null,
    "column_comment": "Holds the ID (counter) of the last issued refresh token."
  },
  {
    "schema_name": "auth",
    "table_name": "sessions",
    "ordinal_position": 15,
    "column_name": "scopes",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sso_domains",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sso_domains",
    "ordinal_position": 2,
    "column_name": "sso_provider_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sso_domains",
    "ordinal_position": 3,
    "column_name": "domain",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sso_domains",
    "ordinal_position": 4,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sso_domains",
    "ordinal_position": 5,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sso_providers",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sso_providers",
    "ordinal_position": 2,
    "column_name": "resource_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": "Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code."
  },
  {
    "schema_name": "auth",
    "table_name": "sso_providers",
    "ordinal_position": 3,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sso_providers",
    "ordinal_position": 4,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "sso_providers",
    "ordinal_position": 5,
    "column_name": "disabled",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 1,
    "column_name": "instance_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 2,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 3,
    "column_name": "aud",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 4,
    "column_name": "role",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 5,
    "column_name": "email",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 6,
    "column_name": "encrypted_password",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 7,
    "column_name": "email_confirmed_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 8,
    "column_name": "invited_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 9,
    "column_name": "confirmation_token",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 10,
    "column_name": "confirmation_sent_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 11,
    "column_name": "recovery_token",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 12,
    "column_name": "recovery_sent_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 13,
    "column_name": "email_change_token_new",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 14,
    "column_name": "email_change",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 15,
    "column_name": "email_change_sent_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 16,
    "column_name": "last_sign_in_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 17,
    "column_name": "raw_app_meta_data",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 18,
    "column_name": "raw_user_meta_data",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 19,
    "column_name": "is_super_admin",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 20,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 21,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 22,
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": true,
    "column_default": "NULL::character varying",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 23,
    "column_name": "phone_confirmed_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 24,
    "column_name": "phone_change",
    "data_type": "text",
    "is_nullable": true,
    "column_default": "''::character varying",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 25,
    "column_name": "phone_change_token",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": "''::character varying",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 26,
    "column_name": "phone_change_sent_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 27,
    "column_name": "confirmed_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "LEAST(email_confirmed_at, phone_confirmed_at)",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 28,
    "column_name": "email_change_token_current",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": "''::character varying",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 29,
    "column_name": "email_change_confirm_status",
    "data_type": "smallint",
    "is_nullable": true,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 30,
    "column_name": "banned_until",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 31,
    "column_name": "reauthentication_token",
    "data_type": "character varying(255)",
    "is_nullable": true,
    "column_default": "''::character varying",
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 32,
    "column_name": "reauthentication_sent_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 33,
    "column_name": "is_sso_user",
    "data_type": "boolean",
    "is_nullable": false,
    "column_default": "false",
    "column_comment": "Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails."
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 34,
    "column_name": "deleted_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "auth",
    "table_name": "users",
    "ordinal_position": 35,
    "column_name": "is_anonymous",
    "data_type": "boolean",
    "is_nullable": false,
    "column_default": "false",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "addon_credit_packs",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "addon_credit_packs",
    "ordinal_position": 2,
    "column_name": "name",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "addon_credit_packs",
    "ordinal_position": 3,
    "column_name": "credits",
    "data_type": "integer",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "addon_credit_packs",
    "ordinal_position": 4,
    "column_name": "price",
    "data_type": "numeric(10,2)",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "addon_credit_packs",
    "ordinal_position": 5,
    "column_name": "discount_percent",
    "data_type": "integer",
    "is_nullable": true,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "addon_credit_packs",
    "ordinal_position": 6,
    "column_name": "stripe_product_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "addon_credit_packs",
    "ordinal_position": 7,
    "column_name": "stripe_price_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "addon_credit_packs",
    "ordinal_position": 8,
    "column_name": "active",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "true",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "addon_credit_packs",
    "ordinal_position": 9,
    "column_name": "display_order",
    "data_type": "integer",
    "is_nullable": true,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "addon_credit_packs",
    "ordinal_position": 10,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 3,
    "column_name": "job_title",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 4,
    "column_name": "company",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 5,
    "column_name": "job_description",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 6,
    "column_name": "match_score",
    "data_type": "integer",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 7,
    "column_name": "matching_skills",
    "data_type": "text[]",
    "is_nullable": true,
    "column_default": "'{}'::text[]",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 8,
    "column_name": "missing_skills",
    "data_type": "text[]",
    "is_nullable": true,
    "column_default": "'{}'::text[]",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 9,
    "column_name": "suggestions",
    "data_type": "text[]",
    "is_nullable": true,
    "column_default": "'{}'::text[]",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 10,
    "column_name": "requirements",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 11,
    "column_name": "gaps",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 12,
    "column_name": "generated_cv",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 13,
    "column_name": "cover_letter",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 14,
    "column_name": "email",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 15,
    "column_name": "company_research",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 16,
    "column_name": "cv_edits",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": "'[]'::jsonb",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 17,
    "column_name": "optimized_pdf_path",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 18,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 19,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 20,
    "column_name": "job_url",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 21,
    "column_name": "company_address",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 22,
    "column_name": "company_contact_person",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 23,
    "column_name": "optimized_cv_text",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 24,
    "column_name": "email_subject",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 25,
    "column_name": "email_body",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 26,
    "column_name": "selected_template",
    "data_type": "text",
    "is_nullable": true,
    "column_default": "'premium-ats'::text",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 27,
    "column_name": "status",
    "data_type": "text",
    "is_nullable": true,
    "column_default": "'draft'::text",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 28,
    "column_name": "cover_letter_language",
    "data_type": "text",
    "is_nullable": true,
    "column_default": "'de'::text",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 29,
    "column_name": "fit_assessment",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "application_sessions",
    "ordinal_position": 30,
    "column_name": "generation_completed",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "false",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "ordinal_position": 2,
    "column_name": "session_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "ordinal_position": 3,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "ordinal_position": 4,
    "column_name": "role",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "ordinal_position": 5,
    "column_name": "content",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "ordinal_position": 6,
    "column_name": "actions",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": "'[]'::jsonb",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "chat_messages",
    "ordinal_position": 7,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "connected_accounts",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "connected_accounts",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "connected_accounts",
    "ordinal_position": 3,
    "column_name": "provider",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "connected_accounts",
    "ordinal_position": 4,
    "column_name": "provider_user_id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "connected_accounts",
    "ordinal_position": 5,
    "column_name": "provider_email",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "connected_accounts",
    "ordinal_position": 6,
    "column_name": "access_token",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "connected_accounts",
    "ordinal_position": 7,
    "column_name": "refresh_token",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "connected_accounts",
    "ordinal_position": 8,
    "column_name": "token_expires_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "connected_accounts",
    "ordinal_position": 9,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "connected_accounts",
    "ordinal_position": 10,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "credit_transactions",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "credit_transactions",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "credit_transactions",
    "ordinal_position": 3,
    "column_name": "amount",
    "data_type": "numeric(10,2)",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "credit_transactions",
    "ordinal_position": 4,
    "column_name": "transaction_type",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "credit_transactions",
    "ordinal_position": 5,
    "column_name": "session_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "credit_transactions",
    "ordinal_position": 6,
    "column_name": "description",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "credit_transactions",
    "ordinal_position": 7,
    "column_name": "metadata",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": "'{}'::jsonb",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "credit_transactions",
    "ordinal_position": 8,
    "column_name": "balance_before",
    "data_type": "numeric(10,2)",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "credit_transactions",
    "ordinal_position": 9,
    "column_name": "balance_after",
    "data_type": "numeric(10,2)",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "credit_transactions",
    "ordinal_position": 10,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 3,
    "column_name": "type",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 4,
    "column_name": "file_name",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 5,
    "column_name": "file_type",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 6,
    "column_name": "file_size",
    "data_type": "integer",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 7,
    "column_name": "storage_path",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 8,
    "column_name": "raw_text",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 9,
    "column_name": "sections",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": "'{}'::jsonb",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 10,
    "column_name": "all_skills",
    "data_type": "text[]",
    "is_nullable": true,
    "column_default": "'{}'::text[]",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 11,
    "column_name": "all_experiences",
    "data_type": "text[]",
    "is_nullable": true,
    "column_default": "'{}'::text[]",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 12,
    "column_name": "all_education",
    "data_type": "text[]",
    "is_nullable": true,
    "column_default": "'{}'::text[]",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 13,
    "column_name": "structured_data",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 14,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "documents",
    "ordinal_position": 15,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "message_feedback",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "message_feedback",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "message_feedback",
    "ordinal_position": 3,
    "column_name": "session_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "message_feedback",
    "ordinal_position": 4,
    "column_name": "message_id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "message_feedback",
    "ordinal_position": 5,
    "column_name": "feedback_type",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "message_feedback",
    "ordinal_position": 6,
    "column_name": "feedback_text",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "message_feedback",
    "ordinal_position": 7,
    "column_name": "message_content",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "message_feedback",
    "ordinal_position": 8,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profile_photos",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profile_photos",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profile_photos",
    "ordinal_position": 3,
    "column_name": "file_name",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profile_photos",
    "ordinal_position": 4,
    "column_name": "storage_path",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profile_photos",
    "ordinal_position": 5,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 2,
    "column_name": "email",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 3,
    "column_name": "full_name",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 4,
    "column_name": "phone",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 5,
    "column_name": "location",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 6,
    "column_name": "avatar_url",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 7,
    "column_name": "subscription_tier",
    "data_type": "text",
    "is_nullable": true,
    "column_default": "'free'::text",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 8,
    "column_name": "subscription_status",
    "data_type": "text",
    "is_nullable": true,
    "column_default": "'active'::text",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 9,
    "column_name": "notify_tips",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "true",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 10,
    "column_name": "notify_updates",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "true",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 11,
    "column_name": "notify_weekly",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "true",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 12,
    "column_name": "notify_marketing",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "false",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 13,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 14,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 15,
    "column_name": "linkedin_url",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 16,
    "column_name": "github_url",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 17,
    "column_name": "portfolio_url",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "profiles",
    "ordinal_position": 18,
    "column_name": "website_url",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 2,
    "column_name": "tier",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 3,
    "column_name": "name",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 4,
    "column_name": "description",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 5,
    "column_name": "price_monthly",
    "data_type": "numeric(10,2)",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 6,
    "column_name": "price_yearly",
    "data_type": "numeric(10,2)",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 7,
    "column_name": "credits_monthly",
    "data_type": "integer",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 8,
    "column_name": "rollover_months",
    "data_type": "integer",
    "is_nullable": true,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 9,
    "column_name": "max_rollover_credits",
    "data_type": "integer",
    "is_nullable": true,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 10,
    "column_name": "addon_enabled",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "false",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 11,
    "column_name": "stripe_product_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 12,
    "column_name": "stripe_price_id_monthly",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 13,
    "column_name": "stripe_price_id_yearly",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 14,
    "column_name": "active",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "true",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 15,
    "column_name": "display_order",
    "data_type": "integer",
    "is_nullable": true,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 16,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscription_plans",
    "ordinal_position": 17,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 3,
    "column_name": "tier",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 4,
    "column_name": "status",
    "data_type": "text",
    "is_nullable": false,
    "column_default": "'active'::text",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 5,
    "column_name": "stripe_customer_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 6,
    "column_name": "stripe_subscription_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 7,
    "column_name": "stripe_price_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 8,
    "column_name": "current_period_start",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 9,
    "column_name": "current_period_end",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 10,
    "column_name": "cancel_at_period_end",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "false",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 11,
    "column_name": "canceled_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 12,
    "column_name": "trial_start",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 13,
    "column_name": "trial_end",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 14,
    "column_name": "applications_used",
    "data_type": "integer",
    "is_nullable": true,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 15,
    "column_name": "applications_limit",
    "data_type": "integer",
    "is_nullable": true,
    "column_default": "5",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 16,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "subscriptions",
    "ordinal_position": 17,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "user_credits",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "user_credits",
    "ordinal_position": 2,
    "column_name": "user_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "user_credits",
    "ordinal_position": 3,
    "column_name": "monthly_credits",
    "data_type": "numeric(10,2)",
    "is_nullable": true,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "user_credits",
    "ordinal_position": 4,
    "column_name": "rollover_credits",
    "data_type": "numeric(10,2)",
    "is_nullable": true,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "user_credits",
    "ordinal_position": 5,
    "column_name": "addon_credits",
    "data_type": "numeric(10,2)",
    "is_nullable": true,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "user_credits",
    "ordinal_position": 6,
    "column_name": "plan_tier",
    "data_type": "text",
    "is_nullable": false,
    "column_default": "'starter'::text",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "user_credits",
    "ordinal_position": 7,
    "column_name": "last_reset_date",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "user_credits",
    "ordinal_position": 8,
    "column_name": "next_reset_date",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "(now() + '1 mon'::interval)",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "user_credits",
    "ordinal_position": 9,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "public",
    "table_name": "user_credits",
    "ordinal_position": 10,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "messages",
    "ordinal_position": 3,
    "column_name": "topic",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "messages",
    "ordinal_position": 4,
    "column_name": "extension",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "messages",
    "ordinal_position": 5,
    "column_name": "payload",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "messages",
    "ordinal_position": 6,
    "column_name": "event",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "messages",
    "ordinal_position": 7,
    "column_name": "private",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "false",
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "messages",
    "ordinal_position": 8,
    "column_name": "updated_at",
    "data_type": "timestamp without time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "messages",
    "ordinal_position": 9,
    "column_name": "inserted_at",
    "data_type": "timestamp without time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "messages",
    "ordinal_position": 10,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "schema_migrations",
    "ordinal_position": 1,
    "column_name": "version",
    "data_type": "bigint",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "schema_migrations",
    "ordinal_position": 2,
    "column_name": "inserted_at",
    "data_type": "timestamp(0) without time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "subscription",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "bigint",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "subscription",
    "ordinal_position": 2,
    "column_name": "subscription_id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "subscription",
    "ordinal_position": 4,
    "column_name": "entity",
    "data_type": "regclass",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "subscription",
    "ordinal_position": 5,
    "column_name": "filters",
    "data_type": "realtime.user_defined_filter[]",
    "is_nullable": false,
    "column_default": "'{}'::realtime.user_defined_filter[]",
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "subscription",
    "ordinal_position": 7,
    "column_name": "claims",
    "data_type": "jsonb",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "subscription",
    "ordinal_position": 8,
    "column_name": "claims_role",
    "data_type": "regrole",
    "is_nullable": false,
    "column_default": "realtime.to_regrole((claims ->> 'role'::text))",
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "subscription",
    "ordinal_position": 9,
    "column_name": "created_at",
    "data_type": "timestamp without time zone",
    "is_nullable": false,
    "column_default": "timezone('utc'::text, now())",
    "column_comment": null
  },
  {
    "schema_name": "realtime",
    "table_name": "subscription",
    "ordinal_position": 10,
    "column_name": "action_filter",
    "data_type": "text",
    "is_nullable": true,
    "column_default": "'*'::text",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets",
    "ordinal_position": 2,
    "column_name": "name",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets",
    "ordinal_position": 3,
    "column_name": "owner",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": "Field is deprecated, use owner_id instead"
  },
  {
    "schema_name": "storage",
    "table_name": "buckets",
    "ordinal_position": 4,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets",
    "ordinal_position": 5,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets",
    "ordinal_position": 6,
    "column_name": "public",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "false",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets",
    "ordinal_position": 7,
    "column_name": "avif_autodetection",
    "data_type": "boolean",
    "is_nullable": true,
    "column_default": "false",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets",
    "ordinal_position": 8,
    "column_name": "file_size_limit",
    "data_type": "bigint",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets",
    "ordinal_position": 9,
    "column_name": "allowed_mime_types",
    "data_type": "text[]",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets",
    "ordinal_position": 10,
    "column_name": "owner_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets",
    "ordinal_position": 11,
    "column_name": "type",
    "data_type": "storage.buckettype",
    "is_nullable": false,
    "column_default": "'STANDARD'::storage.buckettype",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets_analytics",
    "ordinal_position": 1,
    "column_name": "name",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets_analytics",
    "ordinal_position": 2,
    "column_name": "type",
    "data_type": "storage.buckettype",
    "is_nullable": false,
    "column_default": "'ANALYTICS'::storage.buckettype",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets_analytics",
    "ordinal_position": 3,
    "column_name": "format",
    "data_type": "text",
    "is_nullable": false,
    "column_default": "'ICEBERG'::text",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets_analytics",
    "ordinal_position": 4,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets_analytics",
    "ordinal_position": 5,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets_analytics",
    "ordinal_position": 6,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets_analytics",
    "ordinal_position": 7,
    "column_name": "deleted_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets_vectors",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets_vectors",
    "ordinal_position": 2,
    "column_name": "type",
    "data_type": "storage.buckettype",
    "is_nullable": false,
    "column_default": "'VECTOR'::storage.buckettype",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets_vectors",
    "ordinal_position": 3,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "buckets_vectors",
    "ordinal_position": 4,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "migrations",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "integer",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "migrations",
    "ordinal_position": 2,
    "column_name": "name",
    "data_type": "character varying(100)",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "migrations",
    "ordinal_position": 3,
    "column_name": "hash",
    "data_type": "character varying(40)",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "migrations",
    "ordinal_position": 4,
    "column_name": "executed_at",
    "data_type": "timestamp without time zone",
    "is_nullable": true,
    "column_default": "CURRENT_TIMESTAMP",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 2,
    "column_name": "bucket_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 3,
    "column_name": "name",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 4,
    "column_name": "owner",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": "Field is deprecated, use owner_id instead"
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 5,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 6,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 7,
    "column_name": "last_accessed_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 8,
    "column_name": "metadata",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 9,
    "column_name": "path_tokens",
    "data_type": "text[]",
    "is_nullable": true,
    "column_default": "string_to_array(name, '/'::text)",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 10,
    "column_name": "version",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 11,
    "column_name": "owner_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 12,
    "column_name": "user_metadata",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "objects",
    "ordinal_position": 13,
    "column_name": "level",
    "data_type": "integer",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "prefixes",
    "ordinal_position": 1,
    "column_name": "bucket_id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "prefixes",
    "ordinal_position": 2,
    "column_name": "name",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "prefixes",
    "ordinal_position": 3,
    "column_name": "level",
    "data_type": "integer",
    "is_nullable": false,
    "column_default": "storage.get_level(name)",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "prefixes",
    "ordinal_position": 4,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "prefixes",
    "ordinal_position": 5,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": true,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads",
    "ordinal_position": 2,
    "column_name": "in_progress_size",
    "data_type": "bigint",
    "is_nullable": false,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads",
    "ordinal_position": 3,
    "column_name": "upload_signature",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads",
    "ordinal_position": 4,
    "column_name": "bucket_id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads",
    "ordinal_position": 5,
    "column_name": "key",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads",
    "ordinal_position": 6,
    "column_name": "version",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads",
    "ordinal_position": 7,
    "column_name": "owner_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads",
    "ordinal_position": 8,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads",
    "ordinal_position": 9,
    "column_name": "user_metadata",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads_parts",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads_parts",
    "ordinal_position": 2,
    "column_name": "upload_id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads_parts",
    "ordinal_position": 3,
    "column_name": "size",
    "data_type": "bigint",
    "is_nullable": false,
    "column_default": "0",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads_parts",
    "ordinal_position": 4,
    "column_name": "part_number",
    "data_type": "integer",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads_parts",
    "ordinal_position": 5,
    "column_name": "bucket_id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads_parts",
    "ordinal_position": 6,
    "column_name": "key",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads_parts",
    "ordinal_position": 7,
    "column_name": "etag",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads_parts",
    "ordinal_position": 8,
    "column_name": "owner_id",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads_parts",
    "ordinal_position": 9,
    "column_name": "version",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "s3_multipart_uploads_parts",
    "ordinal_position": 10,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "vector_indexes",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "vector_indexes",
    "ordinal_position": 2,
    "column_name": "name",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "vector_indexes",
    "ordinal_position": 3,
    "column_name": "bucket_id",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "vector_indexes",
    "ordinal_position": 4,
    "column_name": "data_type",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "vector_indexes",
    "ordinal_position": 5,
    "column_name": "dimension",
    "data_type": "integer",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "vector_indexes",
    "ordinal_position": 6,
    "column_name": "distance_metric",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "vector_indexes",
    "ordinal_position": 7,
    "column_name": "metadata_configuration",
    "data_type": "jsonb",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "vector_indexes",
    "ordinal_position": 8,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "storage",
    "table_name": "vector_indexes",
    "ordinal_position": 9,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "now()",
    "column_comment": null
  },
  {
    "schema_name": "vault",
    "table_name": "secrets",
    "ordinal_position": 1,
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": false,
    "column_default": "gen_random_uuid()",
    "column_comment": null
  },
  {
    "schema_name": "vault",
    "table_name": "secrets",
    "ordinal_position": 2,
    "column_name": "name",
    "data_type": "text",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "vault",
    "table_name": "secrets",
    "ordinal_position": 3,
    "column_name": "description",
    "data_type": "text",
    "is_nullable": false,
    "column_default": "''::text",
    "column_comment": null
  },
  {
    "schema_name": "vault",
    "table_name": "secrets",
    "ordinal_position": 4,
    "column_name": "secret",
    "data_type": "text",
    "is_nullable": false,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "vault",
    "table_name": "secrets",
    "ordinal_position": 5,
    "column_name": "key_id",
    "data_type": "uuid",
    "is_nullable": true,
    "column_default": null,
    "column_comment": null
  },
  {
    "schema_name": "vault",
    "table_name": "secrets",
    "ordinal_position": 6,
    "column_name": "nonce",
    "data_type": "bytea",
    "is_nullable": true,
    "column_default": "vault._crypto_aead_det_noncegen()",
    "column_comment": null
  },
  {
    "schema_name": "vault",
    "table_name": "secrets",
    "ordinal_position": 7,
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "CURRENT_TIMESTAMP",
    "column_comment": null
  },
  {
    "schema_name": "vault",
    "table_name": "secrets",
    "ordinal_position": 8,
    "column_name": "updated_at",
    "data_type": "timestamp with time zone",
    "is_nullable": false,
    "column_default": "CURRENT_TIMESTAMP",
    "column_comment": null
  }
]