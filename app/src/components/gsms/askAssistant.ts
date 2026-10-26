/**
 * « Analyser avec l'assistant » : ouvre l'écran de conversation du moteur IA sur un assistant Qualiopi préréglé
 * (config/gsmsAssistants.ts, reconnu à son nom) avec une question relue par l'utilisateur. Même chemin que l'écran
 * « Nouvelle conversation » (views/creatChat/creatChat.vue) : création de la session, puis la page de conversation
 * envoie la question. Rien n'est simulé : sans modèle de discussion, rien n'est proposé ; sans l'assistant préréglé,
 * l'assistant par défaut du moteur répond, et l'écran le dit.
 */
import type { Router } from 'vue-router'
import { BUILTIN_QUICK_ANSWER_ID, BUILTIN_SMART_REASONING_ID, listAgents, type CustomAgent } from '@/api/agent'
import { listModels } from '@/api/model'
import { createSessions, type CreateSessionRequest } from '@/api/chat'
import { findGsmsAssistant, type GsmsAssistantKey } from '@/config/gsmsAssistants'
import { useSettingsStore } from '@/stores/settings'
import { useMenuStore } from '@/stores/menu'

export type AssistantTarget =
  /** Aucun modèle de discussion réglé dans le moteur : rien ne peut répondre. */
  | { kind: 'no-model' }
  /** L'assistant préréglé (`fallback` faux) ou, à défaut, l'assistant par défaut du moteur. */
  | { kind: 'ready'; agent: CustomAgent; fallback: boolean; modelId: string }

/** Assistant qui répondra à `key`, d'après les agents et les modèles que le moteur IA déclare à ce compte. */
export async function resolveAssistant(key: GsmsAssistantKey): Promise<AssistantTarget> {
  const [agentsRes, models] = await Promise.all([listAgents(), listModels('KnowledgeQA')])
  const chat = models.filter((m) => m.id)
  if (!chat.length) return { kind: 'no-model' }
  const res = agentsRes as unknown as { data?: CustomAgent[]; disabled_own_agent_ids?: string[] }
  const disabled = new Set(res.disabled_own_agent_ids ?? [])
  const agents = (res.data ?? []).filter((a) => !disabled.has(a.id))
  const preset = findGsmsAssistant(agents, key)
  const fallback = preset ?? agents.find((a) => a.id === BUILTIN_SMART_REASONING_ID) ?? agents.find((a) => a.id === BUILTIN_QUICK_ANSWER_ID)
  if (!fallback) return { kind: 'no-model' }
  const modelId = fallback.config?.model_id || (chat.find((m) => m.is_default) ?? chat[0]).id || ''
  return { kind: 'ready', agent: fallback, fallback: !preset, modelId }
}

/** Crée la conversation sur `agent` et ouvre la page de conversation, qui envoie `question` comme premier message. */
export async function openAssistantChat(router: Router, target: Extract<AssistantTarget, { kind: 'ready' }>, question: string, title: string) {
  const settings = useSettingsStore()
  const menu = useMenuStore()
  const { agent } = target
  settings.selectAgent(agent.id, null)
  // selectAgent ne règle le mode que pour les deux agents intégrés ; un agent préréglé suit son propre mode.
  if (agent.id !== BUILTIN_QUICK_ANSWER_ID && agent.id !== BUILTIN_SMART_REASONING_ID) {
    settings.toggleAgent(agent.config?.agent_mode === 'smart-reasoning')
  }
  const cfg = settings.agentConfig
  // Même corps que l'écran « Nouvelle conversation » ; l'agent choisi part ensuite avec chaque message (agent_id).
  const res = (await createSessions({
    agent_config: {
      enabled: true, max_iterations: cfg.maxIterations, temperature: cfg.temperature,
      knowledge_bases: [], knowledge_ids: [], allowed_tools: cfg.allowedTools,
    },
  } as unknown as CreateSessionRequest)) as { data?: { id?: string } }
  const id = res?.data?.id
  if (!id) throw new Error('session')
  const now = new Date().toISOString()
  menu.updataMenuChildren({ title, path: `chat/${id}`, id, isMore: false, isNoTitle: true, created_at: now, updated_at: now })
  menu.changeIsFirstSession(true)
  menu.changeFirstQuery(question, [], target.modelId, [], [], null)
  await router.push(`/platform/chat/${id}`)
}
