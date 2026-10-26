package retriever

import "github.com/Tencent/WeKnora/internal/types"

// Engine type labels for fake engines. They deliberately name no real
// driver: the tests only need identities distinct from postgres/sqlite.
const (
	fakeEngineTypeA types.RetrieverEngineType = "fake_engine_a"
	fakeEngineTypeB types.RetrieverEngineType = "fake_engine_b"
)
