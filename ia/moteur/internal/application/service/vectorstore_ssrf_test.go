package service

import (
	"context"
	"os"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/utils"
	"github.com/stretchr/testify/require"
)

// withSSRFWhitelist sets SSRF_WHITELIST for the duration of a test, resetting
// the cached singleton both before and after so neither this test nor a
// neighbour sees a stale whitelist (see ResetSSRFWhitelistForTest docs).
func withSSRFWhitelist(t *testing.T, whitelist string) {
	t.Helper()
	utils.ResetSSRFWhitelistForTest()
	require.NoError(t, os.Setenv("SSRF_WHITELIST", whitelist))
	t.Cleanup(func() {
		_ = os.Unsetenv("SSRF_WHITELIST")
		utils.ResetSSRFWhitelistForTest()
	})
}

func TestValidateConnectionAddrSSRF_FailsClosed(t *testing.T) {
	require.NoError(t, validateConnectionAddrSSRF(types.SQLiteRetrieverEngineType, types.ConnectionConfig{}))
	require.Error(t, validateConnectionAddrSSRF(types.PostgresRetrieverEngineType,
		types.ConnectionConfig{Addr: "postgres://u:p@10.0.0.5:5432/db"}))
	require.Error(t, validateConnectionAddrSSRF("nosuch", types.ConnectionConfig{Addr: "http://10.0.0.5"}))
}

func TestTestRawConnection_Rejections(t *testing.T) {
	withSSRFWhitelist(t, "vector.allowed.test")
	repo := &mockVectorStoreRepo{}
	svc := NewVectorStoreService(repo, nil, nil, nil, nil)

	tests := []struct {
		name       string
		engineType types.RetrieverEngineType
		config     types.ConnectionConfig
	}{
		{
			// postgres is not a user-registerable vector store; raw-testing it
			// would otherwise dial the app's own DB host (credential oracle).
			name:       "postgres rejected by engine allowlist",
			engineType: types.PostgresRetrieverEngineType,
			config:     types.ConnectionConfig{Addr: "postgres://u:p@vector.allowed.test:5432/db"},
		},
		{
			name:       "unknown engine rejected by engine allowlist",
			engineType: "nosuch",
			config:     types.ConnectionConfig{Addr: "http://10.0.0.5:9200"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := svc.TestRawConnection(context.Background(), tt.engineType, tt.config)
			require.Error(t, err)
		})
	}
}
