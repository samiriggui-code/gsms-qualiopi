package types

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ---------------------------------------------------------------------------
// PR2 additions: env store builder, response DTO, types metadata
// ---------------------------------------------------------------------------

// mockEnvLookup creates a simple env lookup function from a map.
func mockEnvLookup(env map[string]string) EnvLookupFunc {
	return func(key string) string {
		return env[key]
	}
}

func TestIsEnvStoreID(t *testing.T) {
	tests := []struct {
		name     string
		id       string
		expected bool
	}{
		{"env postgres ID", "__env_postgres__", true},
		{"env elasticsearch ID", "__env_elasticsearch_v8__", true},
		{"env prefix only", "__env_", true},
		{"UUID ID", "550e8400-e29b-41d4-a716-446655440000", false},
		{"empty string", "", false},
		{"similar but not prefix", "_env_postgres__", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, IsEnvStoreID(tt.id))
		})
	}
}

func TestBuildEnvVectorStores(t *testing.T) {
	lookup := mockEnvLookup(map[string]string{})

	t.Run("empty RETRIEVE_DRIVER returns nil", func(t *testing.T) {
		stores := BuildEnvVectorStores("", lookup)
		assert.Nil(t, stores)
	})

	t.Run("single driver postgres", func(t *testing.T) {
		stores := BuildEnvVectorStores("postgres", lookup)
		require.Len(t, stores, 1)
		assert.Equal(t, "__env_postgres__", stores[0].ID)
		assert.Equal(t, "PostgreSQL (pgvector + ParadeDB)", stores[0].Name)
		assert.Equal(t, PostgresRetrieverEngineType, stores[0].EngineType)
		assert.True(t, stores[0].ConnectionConfig.UseDefaultConnection)
	})

	t.Run("unknown and removed drivers are skipped", func(t *testing.T) {
		stores := BuildEnvVectorStores("postgres,unknown_db,elasticsearch_v8,qdrant", lookup)
		require.Len(t, stores, 1)
		assert.Equal(t, "__env_postgres__", stores[0].ID)
	})

	t.Run("whitespace trimmed", func(t *testing.T) {
		stores := BuildEnvVectorStores(" postgres , sqlite ", lookup)
		require.Len(t, stores, 2)
		assert.Equal(t, "__env_sqlite__", stores[1].ID)
	})
}

func TestFindEnvVectorStore(t *testing.T) {
	lookup := mockEnvLookup(map[string]string{})

	t.Run("found", func(t *testing.T) {
		store := FindEnvVectorStore("postgres", lookup, "__env_postgres__")
		require.NotNil(t, store)
		assert.Equal(t, "__env_postgres__", store.ID)
	})

	t.Run("not found", func(t *testing.T) {
		store := FindEnvVectorStore("postgres", lookup, "__env_unknown__")
		assert.Nil(t, store)
	})

	t.Run("empty driver returns nil", func(t *testing.T) {
		store := FindEnvVectorStore("", lookup, "__env_postgres__")
		assert.Nil(t, store)
	})
}

func TestNewVectorStoreResponse(t *testing.T) {
	store := &VectorStore{
		ID:         "test-id",
		Name:       "test-store",
		EngineType: PostgresRetrieverEngineType,
		ConnectionConfig: ConnectionConfig{
			Addr:     "http://es:9200",
			Password: "secret",
			APIKey:   "my-api-key",
		},
	}

	t.Run("masks sensitive fields", func(t *testing.T) {
		resp := NewVectorStoreResponse(store, "user", false)
		assert.Equal(t, RedactedSecretPlaceholder, resp.ConnectionConfig.Password)
		assert.Equal(t, RedactedSecretPlaceholder, resp.ConnectionConfig.APIKey)
		assert.Equal(t, "http://es:9200", resp.ConnectionConfig.Addr) // non-sensitive preserved
	})

	t.Run("preserves source and readonly", func(t *testing.T) {
		resp := NewVectorStoreResponse(store, "env", true)
		assert.Equal(t, "env", resp.Source)
		assert.True(t, resp.ReadOnly)
	})

	t.Run("does not mutate original store", func(t *testing.T) {
		_ = NewVectorStoreResponse(store, "user", false)
		assert.Equal(t, "secret", store.ConnectionConfig.Password)
		assert.Equal(t, "my-api-key", store.ConnectionConfig.APIKey)
	})

	t.Run("empty sensitive fields not masked to ***", func(t *testing.T) {
		noSecret := &VectorStore{
			ID:               "test-id",
			ConnectionConfig: ConnectionConfig{Addr: "http://es:9200"},
		}
		resp := NewVectorStoreResponse(noSecret, "user", false)
		assert.Equal(t, "", resp.ConnectionConfig.Password)
		assert.Equal(t, "", resp.ConnectionConfig.APIKey)
	})
}

func TestGetVectorStoreTypes(t *testing.T) {
	// PostgreSQL and SQLite are env-only, so no engine type is registerable.
	assert.Empty(t, GetVectorStoreTypes())
}

// testAESKey is a 32-byte key for testing AES-GCM encryption.
const testAESKey = "01234567890123456789012345678901"

// ---------------------------------------------------------------------------
// VectorStore
// ---------------------------------------------------------------------------

func TestVectorStore_Validate(t *testing.T) {
	t.Run("empty name returns error", func(t *testing.T) {
		err := (&VectorStore{EngineType: PostgresRetrieverEngineType, TenantID: 1}).Validate()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "name is required")
	})

	// No remaining engine can be registered as a DB store.
	for _, et := range []RetrieverEngineType{"unknown", PostgresRetrieverEngineType, SQLiteRetrieverEngineType} {
		t.Run("unsupported engine type "+string(et), func(t *testing.T) {
			err := (&VectorStore{Name: "s", EngineType: et, TenantID: 1}).Validate()
			require.Error(t, err)
			assert.Contains(t, err.Error(), "unsupported engine type")
		})
	}
}

func TestVectorStore_BeforeCreate(t *testing.T) {
	t.Run("generates UUID when ID is empty", func(t *testing.T) {
		v := &VectorStore{}
		err := v.BeforeCreate(&gorm.DB{})
		require.NoError(t, err)
		assert.NotEmpty(t, v.ID)
		assert.Len(t, v.ID, 36) // UUID format: 8-4-4-4-12
	})

	t.Run("preserves existing ID", func(t *testing.T) {
		v := &VectorStore{ID: "existing-id"}
		err := v.BeforeCreate(&gorm.DB{})
		require.NoError(t, err)
		assert.Equal(t, "existing-id", v.ID)
	})
}

func TestVectorStore_TableName(t *testing.T) {
	assert.Equal(t, "vector_stores", VectorStore{}.TableName())
}

func TestIsValidEngineType(t *testing.T) {
	// Postgres and SQLite are intentionally NOT registerable as DB stores —
	// they only make sense as env stores driven by RETRIEVE_DRIVER (see the
	// doc comment on validEngineTypes).
	for _, et := range []RetrieverEngineType{"unknown", "", PostgresRetrieverEngineType, SQLiteRetrieverEngineType} {
		assert.False(t, IsValidEngineType(et), "%q", et)
	}
}

// ---------------------------------------------------------------------------
// ConnectionConfig
// ---------------------------------------------------------------------------

func TestConnectionConfig_ValueScan(t *testing.T) {
	t.Run("encrypts password and api_key on Value, decrypts on Scan", func(t *testing.T) {
		t.Setenv("SYSTEM_AES_KEY", testAESKey)

		original := ConnectionConfig{
			Addr:     "http://es:9200",
			Username: "elastic",
			Password: "secret-pass",
			APIKey:   "sk-api-key",
		}

		// Value — encrypt
		raw, err := original.Value()
		require.NoError(t, err)

		// Verify the serialized JSON has encrypted fields
		var intermediate map[string]interface{}
		require.NoError(t, json.Unmarshal(raw.([]byte), &intermediate))
		assert.True(t, strings.HasPrefix(intermediate["password"].(string), "enc:v1:"))
		assert.True(t, strings.HasPrefix(intermediate["api_key"].(string), "enc:v1:"))
		// Non-sensitive fields remain plaintext
		assert.Equal(t, "http://es:9200", intermediate["addr"])
		assert.Equal(t, "elastic", intermediate["username"])

		// Scan — decrypt
		var scanned ConnectionConfig
		err = scanned.Scan(raw.([]byte))
		require.NoError(t, err)
		assert.Equal(t, "secret-pass", scanned.Password)
		assert.Equal(t, "sk-api-key", scanned.APIKey)
		assert.Equal(t, "http://es:9200", scanned.Addr)
		assert.Equal(t, "elastic", scanned.Username)
	})

	t.Run("skips encryption when fields are empty", func(t *testing.T) {
		t.Setenv("SYSTEM_AES_KEY", testAESKey)

		original := ConnectionConfig{Addr: "http://es:9200"}
		raw, err := original.Value()
		require.NoError(t, err)

		var intermediate map[string]interface{}
		require.NoError(t, json.Unmarshal(raw.([]byte), &intermediate))
		_, hasPassword := intermediate["password"]
		_, hasAPIKey := intermediate["api_key"]
		assert.False(t, hasPassword)
		assert.False(t, hasAPIKey)
	})

	t.Run("skips encryption when AES key is not set", func(t *testing.T) {
		t.Setenv("SYSTEM_AES_KEY", "")

		original := ConnectionConfig{
			Password: "secret-pass",
			APIKey:   "sk-api-key",
		}
		raw, err := original.Value()
		require.NoError(t, err)

		var intermediate map[string]interface{}
		require.NoError(t, json.Unmarshal(raw.([]byte), &intermediate))
		assert.Equal(t, "secret-pass", intermediate["password"])
		assert.Equal(t, "sk-api-key", intermediate["api_key"])
	})

	t.Run("does not double-encrypt already encrypted values", func(t *testing.T) {
		t.Setenv("SYSTEM_AES_KEY", testAESKey)

		original := ConnectionConfig{Password: "secret-pass"}
		raw1, err := original.Value()
		require.NoError(t, err)

		// Scan to get the encrypted form, then re-serialize
		var scanned ConnectionConfig
		require.NoError(t, json.Unmarshal(raw1.([]byte), &scanned))
		// scanned.Password is now "enc:v1:..."
		raw2, err := scanned.Value()
		require.NoError(t, err)

		// Both serialized forms should produce the same decrypted result
		var result ConnectionConfig
		require.NoError(t, result.Scan(raw2.([]byte)))
		assert.Equal(t, "secret-pass", result.Password)
	})

	t.Run("Scan nil value returns no error", func(t *testing.T) {
		var c ConnectionConfig
		assert.NoError(t, c.Scan(nil))
	})

	t.Run("Scan non-byte value returns no error", func(t *testing.T) {
		var c ConnectionConfig
		assert.NoError(t, c.Scan(42))
	})

	t.Run("original struct is not mutated by Value", func(t *testing.T) {
		t.Setenv("SYSTEM_AES_KEY", testAESKey)

		original := ConnectionConfig{Password: "secret-pass"}
		_, err := original.Value()
		require.NoError(t, err)
		assert.Equal(t, "secret-pass", original.Password, "value receiver should not mutate original")
	})
}

func TestConnectionConfig_GetEndpoint(t *testing.T) {
	tests := []struct {
		name     string
		config   ConnectionConfig
		expected string
	}{
		{
			name:     "returns Addr when set",
			config:   ConnectionConfig{Addr: "http://es:9200"},
			expected: "http://es:9200",
		},
		{
			name:     "returns sentinel for default postgres connection",
			config:   ConnectionConfig{UseDefaultConnection: true},
			expected: "__default_postgres__",
		},
		{
			name:     "returns empty string when nothing is set",
			config:   ConnectionConfig{},
			expected: "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.config.GetEndpoint())
		})
	}
}

func TestConnectionConfig_MaskSensitiveFields(t *testing.T) {
	t.Run("masks password and api_key", func(t *testing.T) {
		c := ConnectionConfig{
			Addr:     "http://es:9200",
			Username: "elastic",
			Password: "secret-pass",
			APIKey:   "sk-api-key",
		}
		masked := c.MaskSensitiveFields()
		assert.Equal(t, RedactedSecretPlaceholder, masked.Password)
		assert.Equal(t, RedactedSecretPlaceholder, masked.APIKey)
		assert.Equal(t, "http://es:9200", masked.Addr)
		assert.Equal(t, "elastic", masked.Username)
	})

	t.Run("does not mask empty fields", func(t *testing.T) {
		c := ConnectionConfig{Addr: "http://es:9200"}
		masked := c.MaskSensitiveFields()
		assert.Empty(t, masked.Password)
		assert.Empty(t, masked.APIKey)
	})

	t.Run("does not mutate original", func(t *testing.T) {
		c := ConnectionConfig{Password: "secret-pass", APIKey: "sk-api-key"}
		_ = c.MaskSensitiveFields()
		assert.Equal(t, "secret-pass", c.Password)
		assert.Equal(t, "sk-api-key", c.APIKey)
	})

}

// ---------------------------------------------------------------------------
// IndexConfig
// ---------------------------------------------------------------------------

func TestIndexConfig_ValueScan(t *testing.T) {
	t.Run("round-trip serialization", func(t *testing.T) {
		original := IndexConfig{IndexName: "my_index"}
		raw, err := original.Value()
		require.NoError(t, err)

		var scanned IndexConfig
		require.NoError(t, scanned.Scan(raw.([]byte)))
		assert.Equal(t, original, scanned)
	})

	t.Run("empty config serializes to {}", func(t *testing.T) {
		raw, err := IndexConfig{}.Value()
		require.NoError(t, err)
		assert.JSONEq(t, `{}`, string(raw.([]byte)))
	})

	t.Run("Scan nil value returns no error", func(t *testing.T) {
		var c IndexConfig
		assert.NoError(t, c.Scan(nil))
	})

	t.Run("Scan non-byte value returns no error", func(t *testing.T) {
		var c IndexConfig
		assert.NoError(t, c.Scan(42))
	})
}

// ---------------------------------------------------------------------------
// ValidateIndexConfig
// ---------------------------------------------------------------------------

func TestValidateIndexConfig(t *testing.T) {
	t.Run("empty config is valid", func(t *testing.T) {
		assert.NoError(t, ValidateIndexConfig(IndexConfig{}))
	})

	t.Run("index_name with special chars rejected", func(t *testing.T) {
		err := ValidateIndexConfig(IndexConfig{IndexName: "my index*"})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "index_name")
	})

	t.Run("index_name starting with number rejected", func(t *testing.T) {
		require.Error(t, ValidateIndexConfig(IndexConfig{IndexName: "123abc"}))
	})

	t.Run("valid name with underscore and hyphen", func(t *testing.T) {
		assert.NoError(t, ValidateIndexConfig(IndexConfig{IndexName: "my_index-v2"}))
	})
}

// TestVectorStore_PostgresSqliteNotRegisterable pins the write-path and
// read-path consistency for the two engines that are only meaningful as env
// stores. They must:
//
//  1. Be rejected by Validate() so POST /vector-stores returns a 4xx
//     instead of silently persisting a row that has no separation effect.
//  2. Be absent from GetVectorStoreTypes() so the UI dropdown doesn't
//     offer them as a choice.
//
// Both checks live here so a future change that re-introduces one path
// (e.g., adds Postgres back to validEngineTypes for some niche case)
// fails this test pair instead of silently re-opening the inconsistency
// that this fix closed.
func TestVectorStore_PostgresSqliteNotRegisterable(t *testing.T) {
	t.Run("Validate rejects postgres as DB store", func(t *testing.T) {
		v := &VectorStore{
			Name: "test", TenantID: 1,
			EngineType: PostgresRetrieverEngineType,
		}
		err := v.Validate()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "unsupported engine type")
	})

	t.Run("Validate rejects sqlite as DB store", func(t *testing.T) {
		v := &VectorStore{
			Name: "test", TenantID: 1,
			EngineType: SQLiteRetrieverEngineType,
		}
		err := v.Validate()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "unsupported engine type")
	})

	t.Run("GetVectorStoreTypes omits postgres and sqlite", func(t *testing.T) {
		listed := GetVectorStoreTypes()
		var got []string
		for _, info := range listed {
			got = append(got, info.Type)
		}
		assert.NotContains(t, got, string(PostgresRetrieverEngineType),
			"postgres must not appear in the UI dropdown — env-store only")
		assert.NotContains(t, got, string(SQLiteRetrieverEngineType),
			"sqlite must not appear in the UI dropdown — env-store only")
	})
}

// ---------------------------------------------------------------------------
// Phase 3 PR1 additions: ConnectionConfig.InsecureSkipVerify backward-compat
// and VectorStoreFieldInfo schema extensions (Immutable / Min / Max / Enum)
// ---------------------------------------------------------------------------

// TestVectorStoreFieldInfo_OmitemptyPreservesWire confirms that the
// four new optional fields (Immutable / Min / Max / Enum) added in
// Phase 3 PR 1 are omitted from JSON when unset, so existing
// VectorStoreFieldInfo entries (without these fields) serialize
// identically before and after the schema extension.
func TestVectorStoreFieldInfo_OmitemptyPreservesWire(t *testing.T) {
	legacy := VectorStoreFieldInfo{
		Name:        "addr",
		Type:        "string",
		Required:    true,
		Description: "URL",
		Default:     "http://localhost:9200",
	}
	out, err := json.Marshal(legacy)
	require.NoError(t, err)
	// Phase 3 new fields must all be omitted from the wire format.
	assert.NotContains(t, string(out), `"immutable"`)
	assert.NotContains(t, string(out), `"min"`)
	assert.NotContains(t, string(out), `"max"`)
	assert.NotContains(t, string(out), `"enum"`)
}

// TestVectorStoreFieldInfo_NewFieldsSerialize verifies the new fields
// appear in JSON when set — exercised by the OpenSearch IndexFields
// entry that lands in a later Phase 3 PR.
func TestVectorStoreFieldInfo_NewFieldsSerialize(t *testing.T) {
	t.Run("immutable", func(t *testing.T) {
		f := VectorStoreFieldInfo{Name: "knn_engine", Type: "string", Immutable: true}
		out, err := json.Marshal(f)
		require.NoError(t, err)
		assert.Contains(t, string(out), `"immutable":true`)
	})

	t.Run("min and max", func(t *testing.T) {
		minV, maxV := float64(4), float64(64)
		f := VectorStoreFieldInfo{Name: "hnsw_m", Type: "number", Min: &minV, Max: &maxV}
		out, err := json.Marshal(f)
		require.NoError(t, err)
		assert.Contains(t, string(out), `"min":4`)
		assert.Contains(t, string(out), `"max":64`)
	})

	t.Run("enum", func(t *testing.T) {
		f := VectorStoreFieldInfo{
			Name: "knn_engine", Type: "string",
			Enum: []string{"lucene", "faiss"},
		}
		out, err := json.Marshal(f)
		require.NoError(t, err)
		assert.Contains(t, string(out), `"enum":["lucene","faiss"]`)
	})

	t.Run("empty enum omits via omitempty", func(t *testing.T) {
		f := VectorStoreFieldInfo{Name: "addr", Type: "string", Enum: []string{}}
		out, err := json.Marshal(f)
		require.NoError(t, err)
		assert.NotContains(t, string(out), `"enum"`)
	})
}

// TestVectorStoreFieldInfo_RoundTrip ensures deserialization back into
// the struct works for all new fields, including the *float64 pointer
// distinction (nil vs explicit 0).
func TestVectorStoreFieldInfo_RoundTrip(t *testing.T) {
	t.Run("min=0 deserializes as &0, not nil", func(t *testing.T) {
		raw := `{"name":"replicas","type":"number","min":0,"max":5}`
		var f VectorStoreFieldInfo
		require.NoError(t, json.Unmarshal([]byte(raw), &f))
		require.NotNil(t, f.Min)
		assert.Equal(t, float64(0), *f.Min)
		require.NotNil(t, f.Max)
		assert.Equal(t, float64(5), *f.Max)
	})

	t.Run("missing min/max deserialize as nil", func(t *testing.T) {
		raw := `{"name":"addr","type":"string"}`
		var f VectorStoreFieldInfo
		require.NoError(t, json.Unmarshal([]byte(raw), &f))
		assert.Nil(t, f.Min)
		assert.Nil(t, f.Max)
	})

	t.Run("min and max are independent pointers", func(t *testing.T) {
		// Setting only Min must leave Max nil (and vice versa). A
		// refactor that accidentally aliases the two via a shared
		// local would still pass the previous two subtests because
		// they always set both ends.
		raw := `{"name":"upper_only","type":"number","max":10}`
		var f VectorStoreFieldInfo
		require.NoError(t, json.Unmarshal([]byte(raw), &f))
		assert.Nil(t, f.Min)
		require.NotNil(t, f.Max)
		assert.Equal(t, float64(10), *f.Max)
	})

	t.Run("nil enum omits via omitempty", func(t *testing.T) {
		// `nil` and `[]string{}` both round-trip through omitempty
		// identically — pin both shapes so a future Go encoder
		// behavior change cannot regress the wire format.
		f := VectorStoreFieldInfo{Name: "addr", Type: "string"} // Enum nil
		out, err := json.Marshal(f)
		require.NoError(t, err)
		assert.NotContains(t, string(out), `"enum"`)
	})
}

