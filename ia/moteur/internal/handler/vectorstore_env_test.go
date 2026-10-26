package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

type envConnectionTestService struct {
	interfaces.VectorStoreService
	engine types.RetrieverEngineType
	config types.ConnectionConfig
	called bool
}

func (s *envConnectionTestService) TestConnection(
	_ context.Context, engine types.RetrieverEngineType, config types.ConnectionConfig,
) (string, error) {
	s.called, s.engine, s.config = true, engine, config
	return "test-version", nil
}

func TestEnvStoreConnectionSettings(t *testing.T) {
	t.Setenv("RETRIEVE_DRIVER", "postgres")

	svc := &envConnectionTestService{}
	h := NewVectorStoreHandler(nil, svc)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/vector-stores/__env_postgres__/test", nil)
	c.Params = gin.Params{{Key: "id", Value: "__env_postgres__"}}
	c.Set(types.TenantIDContextKey.String(), uint64(1))
	h.TestStoreByID(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.True(t, svc.called)
	assert.Equal(t, types.PostgresRetrieverEngineType, svc.engine)
	assert.Equal(t, types.ConnectionConfig{UseDefaultConnection: true}, svc.config)
}
