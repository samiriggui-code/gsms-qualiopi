<template>
  <div class="gsms-settings">
    <div class="section-header">
      <div class="section-header__top">
        <h2>{{ t('gsms.parametres.sections.equipe') }}</h2>
        <t-button v-if="tab === 'comptes'" theme="primary" @click="openCreateUser">{{ t('gsms.parametres.equipe.nouveauCompte') }}</t-button>
        <t-button v-else theme="primary" @click="openRole(null)">{{ t('gsms.parametres.equipe.nouveauRole') }}</t-button>
      </div>
      <p class="section-description">{{ t('gsms.parametres.equipe.description') }}</p>
    </div>

    <t-tabs v-model="tab">
      <t-tab-panel value="comptes" :label="t('gsms.parametres.equipe.comptes')" />
      <t-tab-panel value="roles" :label="t('gsms.parametres.equipe.roles')" />
    </t-tabs>

    <GsmsRefusal v-if="loadError" :error="loadError" inline />
    <GsmsRefusal v-if="actionError" :error="actionError" inline />

    <!-- Comptes -->
    <div v-show="tab === 'comptes'" class="table-frame">
      <t-table row-key="id" :data="users" :columns="userColumns" :loading="loading" size="medium"
        :empty="t('gsms.parametres.equipe.aucunCompte')">
        <template #full_name="{ row }">
          <div class="cell-main">{{ row.full_name }}</div>
          <div class="cell-sub">{{ row.email }}</div>
        </template>
        <template #roles="{ row }">
          <div class="tags">
            <t-tag v-for="r in row.roles" :key="r" size="small" variant="light">{{ roleLabel(r) }}</t-tag>
          </div>
        </template>
        <template #is_active="{ row }">
          <t-switch :value="row.is_active" :loading="busy === row.id" :aria-label="t('gsms.parametres.equipe.compteActif', { name: row.full_name })"
            @change="(v: any) => toggleActive(row, Boolean(v))" />
        </template>
        <template #actions="{ row }">
          <t-button size="small" variant="text" @click="openUserRoles(row)">{{ t('gsms.parametres.equipe.roles') }}</t-button>
        </template>
      </t-table>
    </div>

    <!-- Rôles -->
    <div v-show="tab === 'roles'" class="table-frame">
      <t-table row-key="code" :data="roles" :columns="roleColumns" :loading="loading" size="medium">
        <template #label="{ row }">
          <div class="cell-main">{{ row.label }}</div>
          <div class="cell-sub"><code>{{ row.code }}</code></div>
        </template>
        <template #system="{ row }">
          <t-tag size="small" :theme="row.system ? 'default' : 'primary'" variant="light">
            {{ t(row.system ? 'gsms.parametres.equipe.systeme' : 'gsms.parametres.equipe.personnalise') }}
          </t-tag>
        </template>
        <template #permissions="{ row }">{{ row.permissions.length }}</template>
        <template #actions="{ row }">
          <t-button size="small" variant="text" @click="openRole(row)">{{ t(row.system ? 'gsms.parametres.commun.voir' : 'gsms.parametres.commun.modifier') }}</t-button>
          <t-button v-if="!row.system" size="small" variant="text" theme="danger" @click="removeRole(row)">{{ t('gsms.parametres.commun.supprimer') }}</t-button>
        </template>
      </t-table>
    </div>

    <!-- Création de compte -->
    <t-dialog v-model:visible="createVisible" :header="t('gsms.parametres.equipe.nouveauCompte')" width="560px" attach="body"
      dialog-class-name="gsms-dialog" :confirm-btn="{ content: t('gsms.parametres.commun.creer'), loading: saving }" :cancel-btn="t('gsms.parametres.commun.annuler')"
      @confirm="createAccount">
      <div class="dialog-form">
        <GsmsRefusal v-if="dialogError" :error="dialogError" inline />
        <div class="field-grid">
          <div class="field">
            <span class="field-label">{{ t('gsms.parametres.equipe.nom') }}</span>
            <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-model="newUser.full_name" />
          </div>
          <div class="field">
            <span class="field-label">{{ t('gsms.parametres.equipe.email') }}</span>
            <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-model="newUser.email" type="email" />
          </div>
        </div>
        <div class="field">
          <span class="field-label">{{ t('gsms.parametres.equipe.motDePasse') }}</span>
          <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-model="newUser.password" type="password" autocomplete="new-password" />
          <span class="field-hint">{{ t('gsms.parametres.equipe.motDePasseAide') }}</span>
        </div>
        <div class="field">
          <span class="field-label">Rôles</span>
          <t-checkbox-group v-model="newUser.roles" class="check-col">
            <t-checkbox v-for="r in roles" :key="r.code" :value="r.code">{{ r.label }}</t-checkbox>
          </t-checkbox-group>
        </div>
      </div>
    </t-dialog>

    <!-- Rôles d'un compte -->
    <t-dialog v-model:visible="userRolesVisible" :header="editedUser ? t('gsms.parametres.equipe.rolesDe', { name: editedUser.full_name }) : ''"
      width="560px" attach="body" dialog-class-name="gsms-dialog"
      :confirm-btn="{ content: t('gsms.parametres.commun.enregistrer'), loading: saving }" :cancel-btn="t('gsms.parametres.commun.annuler')" @confirm="saveUserRoles">
      <div class="dialog-form">
        <GsmsRefusal v-if="dialogError" :error="dialogError" inline />
        <t-checkbox-group v-model="editedRoles" class="check-col">
          <t-checkbox v-for="r in roles" :key="r.code" :value="r.code">{{ r.label }}</t-checkbox>
        </t-checkbox-group>
      </div>
    </t-dialog>

    <!-- Rôle : création, modification, consultation -->
    <t-dialog v-model:visible="roleVisible" :header="roleDialogTitle" width="720px" attach="body"
      dialog-class-name="gsms-dialog" :footer="!roleReadOnly"
      :confirm-btn="{ content: t('gsms.parametres.commun.enregistrer'), loading: saving }" :cancel-btn="t('gsms.parametres.commun.annuler')" @confirm="saveRole">
      <div class="dialog-form">
        <GsmsRefusal v-if="dialogError" :error="dialogError" inline />
        <t-alert v-if="roleReadOnly" theme="info"
          :message="t('gsms.parametres.equipe.roleSysteme')" />
        <div class="field-grid">
          <div class="field">
            <span class="field-label">{{ t('gsms.parametres.equipe.code') }}</span>
            <t-input v-model="roleForm.code" :disabled="!!roleEditing" :placeholder="t('gsms.parametres.equipe.codeExemple')" />
            <span v-if="!roleEditing" class="field-hint">{{ t('gsms.parametres.equipe.codeAide') }}</span>
          </div>
          <div class="field">
            <span class="field-label">{{ t('gsms.parametres.equipe.libelle') }}</span>
            <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-model="roleForm.label" :disabled="roleReadOnly" />
          </div>
        </div>
        <div v-if="!roleReadOnly" class="field">
          <span class="field-label">{{ t('gsms.parametres.equipe.descriptionRole') }}</span>
          <t-textarea :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-model="roleForm.description" :autosize="{ minRows: 2, maxRows: 4 }" />
        </div>
        <div class="field">
          <span class="field-label">{{ t('gsms.parametres.equipe.droits') }}</span>
          <div v-for="g in permissionGroups" :key="g.feature" class="perm-group">
            <div class="perm-group__title">{{ g.label }}</div>
            <t-checkbox-group v-model="roleForm.permissions" :disabled="roleReadOnly" class="check-col">
              <t-checkbox v-for="p in g.items" :key="p.code" :value="p.code">
                {{ p.label }} <code class="perm-code">{{ p.code }}</code>
              </t-checkbox>
            </t-checkbox-group>
          </div>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import {
  createRole, createUser, deleteRole, listPermissions, listRoles, listUsers, setUserActive, setUserRoles,
  updateRole, type Permission, type Role, type UserOut,
} from '@/api/gsms/auth'
import { listFeatures } from '@/api/gsms/platform'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'

const { t } = useI18n()
const tab = ref<'comptes' | 'roles'>('comptes')
const users = ref<UserOut[]>([])
const roles = ref<Role[]>([])
const permissions = ref<Permission[]>([])
const featureLabels = ref<Record<string, string>>({})
const loading = ref(true)
const busy = ref('')
const saving = ref(false)
const loadError = ref<unknown>(null)
const actionError = ref<unknown>(null)
const dialogError = ref<unknown>(null)

const userColumns = computed(() => [
  { colKey: 'full_name', title: t('gsms.parametres.equipe.colCompte'), minWidth: 200 },
  { colKey: 'roles', title: t('gsms.parametres.equipe.colRoles'), minWidth: 200 },
  { colKey: 'is_active', title: t('gsms.parametres.equipe.colActif'), width: 80 },
  { colKey: 'actions', title: '', width: 80 },
])
const roleColumns = computed(() => [
  { colKey: 'label', title: t('gsms.parametres.equipe.colRole'), minWidth: 240 },
  { colKey: 'system', title: t('gsms.parametres.equipe.colType'), width: 120 },
  { colKey: 'permissions', title: t('gsms.parametres.equipe.colDroits'), width: 80 },
  { colKey: 'actions', title: '', width: 170 },
])

const roleLabel = (code: string) => roles.value.find((r) => r.code === code)?.label.split(' : ')[0] ?? code

const permissionGroups = computed(() => {
  const groups = new Map<string, Permission[]>()
  for (const p of permissions.value) groups.set(p.feature, [...(groups.get(p.feature) ?? []), p])
  return [...groups.entries()].map(([feature, items]) => ({
    feature, label: feature === 'core' ? t('gsms.parametres.equipe.socle') : (featureLabels.value[feature] ?? feature), items,
  }))
})

async function load() {
  loadError.value = null
  try {
    const [u, r, p, f] = await Promise.all([listUsers(), listRoles(), listPermissions(), listFeatures()])
    users.value = u
    roles.value = r
    permissions.value = p
    featureLabels.value = Object.fromEntries(f.map((x) => [x.code, x.label]))
  } catch (err) {
    loadError.value = err
  } finally {
    loading.value = false
  }
}

async function toggleActive(user: UserOut, active: boolean) {
  busy.value = user.id
  actionError.value = null
  try {
    const updated = await setUserActive(user.id, active)
    users.value = users.value.map((u) => (u.id === user.id ? updated : u))
    MessagePlugin.success(t(active ? 'gsms.parametres.equipe.compteActive' : 'gsms.parametres.equipe.compteDesactive'))
  } catch (err) {
    actionError.value = err
  } finally {
    busy.value = ''
  }
}

// ── Création de compte ──
const createVisible = ref(false)
const newUser = reactive({ full_name: '', email: '', password: '', roles: ['lecture'] as string[] })
function openCreateUser() {
  Object.assign(newUser, { full_name: '', email: '', password: '', roles: ['lecture'] })
  dialogError.value = null
  createVisible.value = true
}
async function createAccount() {
  saving.value = true
  dialogError.value = null
  try {
    const u = await createUser({ ...newUser, email: newUser.email.trim(), full_name: newUser.full_name.trim() })
    users.value = [...users.value, u].sort((a, b) => a.full_name.localeCompare(b.full_name))
    createVisible.value = false
    MessagePlugin.success(t('gsms.parametres.equipe.compteCree'))
  } catch (err) {
    dialogError.value = err
  } finally {
    saving.value = false
  }
}

// ── Rôles d'un compte ──
const userRolesVisible = ref(false)
const editedUser = ref<UserOut | null>(null)
const editedRoles = ref<string[]>([])
function openUserRoles(u: UserOut) {
  editedUser.value = u
  editedRoles.value = [...u.roles]
  dialogError.value = null
  userRolesVisible.value = true
}
async function saveUserRoles() {
  if (!editedUser.value) return
  saving.value = true
  dialogError.value = null
  try {
    const updated = await setUserRoles(editedUser.value.id, editedRoles.value)
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u))
    userRolesVisible.value = false
    MessagePlugin.success(t('gsms.parametres.equipe.rolesEnregistres'))
  } catch (err) {
    dialogError.value = err
  } finally {
    saving.value = false
  }
}

// ── Rôles ──
const roleVisible = ref(false)
const roleEditing = ref<Role | null>(null)
const roleForm = reactive({ code: '', label: '', description: '', permissions: [] as string[] })
const roleReadOnly = computed(() => !!roleEditing.value?.system)
const roleDialogTitle = computed(() => {
  if (!roleEditing.value) return t('gsms.parametres.equipe.nouveauRole')
  return t(roleEditing.value.system ? 'gsms.parametres.equipe.roleSystemeTitre' : 'gsms.parametres.equipe.modifierRole', { label: roleEditing.value.label })
})
function openRole(role: Role | null) {
  roleEditing.value = role
  Object.assign(roleForm, {
    code: role?.code ?? '', label: role?.label ?? '', description: role?.description ?? '',
    permissions: [...(role?.permissions ?? [])],
  })
  dialogError.value = null
  roleVisible.value = true
}
async function saveRole() {
  saving.value = true
  dialogError.value = null
  try {
    if (roleEditing.value) {
      await updateRole(roleEditing.value.code, {
        label: roleForm.label, description: roleForm.description || null, permissions: roleForm.permissions,
      })
    } else {
      await createRole({
        code: roleForm.code.trim(), label: roleForm.label.trim(), description: roleForm.description || null,
        permissions: roleForm.permissions,
      })
    }
    roles.value = await listRoles()
    roleVisible.value = false
    MessagePlugin.success(t('gsms.parametres.equipe.roleEnregistre'))
  } catch (err) {
    dialogError.value = err
  } finally {
    saving.value = false
  }
}
function removeRole(role: Role) {
  const dialog = DialogPlugin.confirm({
    header: t('gsms.parametres.equipe.supprimerRoleTitre', { label: role.label }),
    body: t('gsms.parametres.equipe.supprimerRoleTexte'),
    confirmBtn: t('gsms.parametres.commun.supprimer'),
    cancelBtn: t('gsms.parametres.commun.annuler'),
    theme: 'danger',
    onConfirm: async () => {
      dialog.destroy()
      actionError.value = null
      try {
        await deleteRole(role.code)
        roles.value = roles.value.filter((r) => r.code !== role.code)
        MessagePlugin.success(t('gsms.parametres.equipe.roleSupprime'))
      } catch (err) {
        actionError.value = err
      }
    },
    onClose: () => dialog.destroy(),
  })
}

onMounted(load)
</script>

<style lang="less" scoped>
@import (reference) './gsms-section.less';
@import (reference) './gsms-dialog.less';

.gsms-settings {
  .gsms-section();
}

.dialog-form {
  .gsms-dialog-form();
}

.cell-main {
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.cell-sub {
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);
  word-break: break-all;

  code {
    font-family: var(--app-font-family-mono);
  }
}

.check-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.perm-group {
  padding: 10px 0;
  border-bottom: 1px solid var(--td-component-stroke);

  &:last-child {
    border-bottom: none;
  }
}

.perm-group__title {
  margin-bottom: 6px;
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);
  font-weight: 600;
}

.perm-code {
  margin-left: 4px;
  color: var(--td-text-color-placeholder);
  font-family: var(--app-font-family-mono);
  font-size: var(--app-text-xs);
}
</style>
