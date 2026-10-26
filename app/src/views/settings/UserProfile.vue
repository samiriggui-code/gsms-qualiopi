<template>
  <div class="user-profile">
    <div class="section-header">
      <h2>{{ $t('userProfile.title') }}</h2>
      <p class="section-description">{{ $t('userProfile.description') }}</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-inline">
      <t-loading size="small" />
      <span>{{ $t('tenant.loadingInfo') }}</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="error-inline">
      <t-alert theme="error" :message="error">
        <template #operation>
          <t-button size="small" @click="loadInfo">{{ $t('tenant.retry') }}</t-button>
        </template>
      </t-alert>
    </div>

    <!-- Contenu : compte de l'API qualiopi (celui de la connexion), pas le compte technique du moteur IA -->
    <div v-else class="settings-group">
      <div class="setting-row">
        <div class="setting-info">
          <label>{{ $t('userProfile.nameLabel') }}</label>
          <p class="desc">{{ $t('userProfile.nameDescription') }}</p>
        </div>
        <div class="setting-control">
          <span class="info-value">{{ me?.full_name || '-' }}</span>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <label>{{ $t('userProfile.emailLabel') }}</label>
          <p class="desc">{{ $t('userProfile.emailDescription') }}</p>
        </div>
        <div class="setting-control">
          <span class="info-value">{{ me?.email || '-' }}</span>
        </div>
      </div>

      <!-- Mot de passe : ligne en lecture + bouton d'édition, formulaire dans une fenêtre surgissante -->
      <div class="setting-row">
        <div class="setting-info">
          <label>{{ $t('userProfile.changePassword.label') }}</label>
          <p class="desc">{{ $t('userProfile.changePassword.description') }}</p>
        </div>
        <div class="setting-control">
          <span class="info-value password-mask" aria-hidden="true">••••••••</span>
          <t-popup
            v-model="passwordPopupVisible"
            trigger="click"
            placement="bottom-end"
            destroy-on-close
            overlay-class-name="wk-popover wk-popover--form user-profile-password-popup-overlay"
          >
            <t-button
              theme="default"
              variant="text"
              shape="square"
              size="small"
              class="edit-btn"
              :title="$t('userProfile.changePassword.label')"
              :aria-label="$t('userProfile.changePassword.label')"
            >
              <template #icon>
                <t-icon name="edit" />
              </template>
            </t-button>
            <template #content>
              <div class="password-popup-inner" @click.stop>
                <div class="password-popup-title">{{ $t('userProfile.changePassword.label') }}</div>
                <p class="password-popup-hint">{{ $t('userProfile.changePassword.description') }}</p>
                <t-form
                  ref="passwordFormRef"
                  :data="passwordForm"
                  :rules="passwordRules"
                  label-align="top"
                  class="password-popup-form"
                  @submit.prevent
                >
                  <t-form-item :label="$t('userProfile.changePassword.currentLabel')" name="oldPassword">
                    <t-input
                      v-model="passwordForm.oldPassword"
                      type="password"
                      autocomplete="current-password"
                      :disabled="passwordSubmitting"
                      :placeholder="$t('userProfile.changePassword.currentPlaceholder')"
                    />
                  </t-form-item>
                  <t-form-item :label="$t('userProfile.changePassword.newLabel')" name="newPassword">
                    <t-input
                      v-model="passwordForm.newPassword"
                      type="password"
                      autocomplete="new-password"
                      :disabled="passwordSubmitting"
                      :placeholder="$t('userProfile.changePassword.newPlaceholder')"
                    />
                  </t-form-item>
                  <t-form-item :label="$t('userProfile.changePassword.confirmLabel')" name="confirmPassword">
                    <t-input
                      v-model="passwordForm.confirmPassword"
                      type="password"
                      autocomplete="new-password"
                      :disabled="passwordSubmitting"
                      :placeholder="$t('userProfile.changePassword.confirmPlaceholder')"
                      @enter="submitPasswordChange"
                    />
                  </t-form-item>
                </t-form>
                <div class="password-popup-footer">
                  <t-button variant="outline" :disabled="passwordSubmitting" @click="closePasswordPopup">
                    {{ $t('common.cancel') }}
                  </t-button>
                  <t-button theme="primary" :loading="passwordSubmitting" @click="submitPasswordChange">
                    {{ $t('userProfile.changePassword.submit') }}
                  </t-button>
                </div>
              </div>
            </template>
          </t-popup>
        </div>
      </div>

      <!-- Déconnexion de toutes les sessions (POST /auth/me/deconnexion-partout) -->
      <div class="setting-row">
        <div class="setting-info">
          <label>{{ $t('userProfile.logoutEverywhere.label') }}</label>
          <p class="desc">{{ $t('userProfile.logoutEverywhere.description') }}</p>
        </div>
        <div class="setting-control">
          <t-button theme="danger" variant="outline" :loading="loggingOutEverywhere" @click="confirmLogoutEverywhere">
            {{ $t('userProfile.logoutEverywhere.action') }}
          </t-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import type { FormInstanceFunctions, FormRule } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import { changePassword, getMe, logoutEverywhere, type Me } from '@/api/gsms/auth'
import { tokenStorage } from '@/api/gsms/http'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const me = ref<Me | null>(null)
const loading = ref(true)
const error = ref('')

const passwordPopupVisible = ref(false)
const passwordFormRef = ref<FormInstanceFunctions | null>(null)
const passwordSubmitting = ref(false)
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const loggingOutEverywhere = ref(false)

watch(passwordPopupVisible, () => resetPasswordForm())

// Seuls le remplissage et la confirmation sont contrôlés ici ; les règles du mot de passe (longueur…) sont
// celles de l'API, dont le refus s'affiche tel quel.
const passwordRules = computed<Record<string, FormRule[]>>(() => ({
  oldPassword: [
    { required: true, message: t('userProfile.changePassword.currentRequired'), type: 'error' },
  ],
  newPassword: [
    { required: true, message: t('userProfile.changePassword.newRequired'), type: 'error' },
  ],
  confirmPassword: [
    { required: true, message: t('auth.confirmPasswordRequired'), type: 'error' },
    {
      validator: (val: string) => val === passwordForm.newPassword,
      message: t('auth.passwordMismatch'),
      type: 'error',
      trigger: 'blur',
    },
  ],
}))

const loadInfo = async () => {
  loading.value = true
  error.value = ''
  try {
    me.value = await getMe()
  } catch (err) {
    error.value = (err as Error)?.message || t('tenant.messages.fetchFailed')
  } finally {
    loading.value = false
  }
}

const resetPasswordForm = () => {
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  passwordFormRef.value?.clearValidate?.()
}

const closePasswordPopup = () => {
  if (passwordSubmitting.value) return
  passwordPopupVisible.value = false
}

const submitPasswordChange = async () => {
  if (passwordSubmitting.value) return
  const result = await passwordFormRef.value?.validate?.()
  if (result !== true) return

  passwordSubmitting.value = true
  try {
    // L'API révoque les autres sessions et rend un jeton neuf : on le garde, la session courante continue.
    const session = await changePassword(passwordForm.oldPassword, passwordForm.newPassword)
    tokenStorage.set(session.access_token)
    passwordPopupVisible.value = false
    MessagePlugin.success(t('userProfile.changePassword.success'))
  } catch (err) {
    MessagePlugin.error((err as Error)?.message || t('userProfile.changePassword.failed'))
  } finally {
    passwordSubmitting.value = false
  }
}

const confirmLogoutEverywhere = () => {
  const dialog = DialogPlugin.confirm({
    header: t('userProfile.logoutEverywhere.label'),
    body: t('userProfile.logoutEverywhere.confirm'),
    confirmBtn: { content: t('userProfile.logoutEverywhere.action'), theme: 'danger' },
    cancelBtn: t('common.cancel'),
    onConfirm: async () => {
      dialog.hide()
      loggingOutEverywhere.value = true
      try {
        await logoutEverywhere()
      } catch (err) {
        MessagePlugin.error((err as Error)?.message || t('userProfile.logoutEverywhere.failed'))
        return
      } finally {
        loggingOutEverywhere.value = false
      }
      authStore.logout()
      MessagePlugin.success(t('userProfile.logoutEverywhere.success'))
      router.push('/login')
    },
  })
}

onMounted(loadInfo)
</script>

<style lang="less" scoped>
@import (reference) '@/components/css/settings-section.less';

.user-profile {
  width: 100%;
}

.section-header {
  .settings-section-header();
}

.loading-inline {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
  justify-content: center;
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-base);
}

.error-inline {
  padding: 20px 0;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.setting-row {
  .setting-row();
}

.setting-info {
  .setting-info();
}

.setting-control {
  .setting-control();

  .info-value {
    font-size: var(--app-text-base);
    color: var(--td-text-color-primary);
    text-align: right;
    word-break: break-word;
  }

  .edit-btn {
    flex-shrink: 0;
  }
}

.password-mask {
  letter-spacing: 0.12em;
  color: var(--td-text-color-secondary);
}

.password-popup-inner {
  max-width: 100%;
}

.password-popup-title {
  font-size: var(--app-text-lg);
  font-weight: 600;
  color: var(--td-text-color-primary);
  margin: 0 0 8px;
  line-height: 1.35;
}

.password-popup-hint {
  margin: 0 0 12px;
  font-size: var(--app-text-md);
  line-height: 1.55;
  color: var(--td-text-color-secondary);
}

.password-popup-form {
  :deep(.t-form__item) {
    margin-bottom: 14px;

    &:last-child {
      margin-bottom: 4px;
    }
  }
}

.password-popup-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>

<style lang="less">
/* t-popup 挂到 body，需全局样式；z-index 需高于设置全屏遮罩（2000）。 */
.user-profile-password-popup-overlay {
  z-index: 3050 !important;

}

:root[theme-mode='dark'] .user-profile-password-popup-overlay .t-popup__content {
  background: rgba(36, 36, 36, 0.92) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.05),
    0 2px 4px rgba(0, 0, 0, 0.12),
    0 8px 32px rgba(0, 0, 0, 0.28) !important;
}
</style>
