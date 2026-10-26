package service

import (
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
)

func TestValidateProviderParametersExa(t *testing.T) {
	valid := types.WebSearchProviderParameters{APIKey: "exa-test"}
	if err := validateProviderParameters(types.WebSearchProviderTypeExa, valid); err != nil {
		t.Fatalf("valid Exa parameters rejected: %v", err)
	}
	if !isValidProviderType(types.WebSearchProviderTypeExa) {
		t.Fatal("Exa provider type is not accepted")
	}

	if err := validateProviderParameters(types.WebSearchProviderTypeExa, types.WebSearchProviderParameters{}); err == nil {
		t.Fatal("missing Exa API key was accepted")
	}
}

