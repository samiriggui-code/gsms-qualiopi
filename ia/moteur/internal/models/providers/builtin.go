package providers

import "github.com/Tencent/WeKnora/internal/models/internal/configcopy"

// Builtins returns independent provider definitions without registering global state.
func Builtins() []*Definition {
	return configcopy.Clone([]*Definition{
		newAnthropicProvider(),
		newAzureOpenaiProvider(),
		newCohereProvider(),
		newDeepseekProvider(),
		newGeminiProvider(),
		newGenericProvider(),
		newHuggingFaceTEIProvider(),
		newJinaProvider(),
		newLitellmProvider(),
		newNvidiaProvider(),
		newOpenaiProvider(),
		newOpenrouterProvider(),
		newPineconeProvider(),
	})
}
