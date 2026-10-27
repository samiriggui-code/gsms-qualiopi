// Traduction française des textes propres aux composants TDesign (calendriers, pagination, tableaux, dialogues…).
// TDesign n'en livre pas (tdesign-vue-next/esm/locale : ni fr_FR, ni fr) : sans elle, ces composants s'affichent en
// anglais. Même forme que tdesign-vue-next/esm/locale/en_US (version 1.19.2).
// `dayjsLocale` reste « en » : TDesign l'utilise seulement pour ses calculs de dates, et la locale française de dayjs
// n'est pas une dépendance du projet ; les libellés affichés viennent des tableaux ci-dessous.
import type { GlobalConfigProvider } from 'tdesign-vue-next'

// Clés lues par TDesign 1.19.2 à l'exécution (présentes dans sa locale en_US) mais absentes de ses déclarations de types :
// on les déclare ici plutôt que de les retirer, ce qui remettrait ces textes en anglais.
type RuntimeOnlyKeys = {
  timePicker?: { dayjsLocale?: string }
  table?: { filterInputPlaceholder?: string }
  datePicker?: { placeholder?: { quarter?: string; week?: string } }
  upload?: { triggerUploadText?: { uploading?: string } }
  form?: { errorMessage?: { email?: string } }
  colorPicker?: { singleColor?: string; gradientColor?: string }
}

const frFR: GlobalConfigProvider & RuntimeOnlyKeys = {
  autoComplete: { empty: 'Aucune donnée' },
  pagination: {
    itemsPerPage: '{size} / page',
    jumpTo: 'Aller à',
    page: '',
    total: 'aucun élément | 1 élément | {count} éléments',
  },
  cascader: { empty: 'Aucune donnée', loadingText: 'chargement…', placeholder: 'Choisir' },
  calendar: {
    yearSelection: '{year}',
    monthSelection: '{month}',
    yearRadio: 'année',
    monthRadio: 'mois',
    hideWeekend: 'Masquer le week-end',
    showWeekend: 'Afficher le week-end',
    today: "Aujourd'hui",
    thisMonth: 'Ce mois-ci',
    week: 'Lundi,Mardi,Mercredi,Jeudi,Vendredi,Samedi,Dimanche',
    cellMonth: 'Janvier,Février,Mars,Avril,Mai,Juin,Juillet,Août,Septembre,Octobre,Novembre,Décembre',
  },
  transfer: { title: '{checked} / {total}', empty: 'Aucune donnée', placeholder: 'Rechercher' },
  timePicker: {
    dayjsLocale: 'en',
    now: 'Maintenant',
    confirm: 'Valider',
    anteMeridiem: 'AM',
    postMeridiem: 'PM',
    placeholder: 'Choisir une heure',
  },
  dialog: { confirm: 'Valider', cancel: 'Annuler' },
  drawer: { confirm: 'Valider', cancel: 'Annuler' },
  popconfirm: { confirm: { content: 'OK' }, cancel: { content: 'Annuler' } },
  table: {
    empty: 'Aucune donnée',
    loadingText: 'chargement…',
    loadingMoreText: 'chargement de la suite',
    filterInputPlaceholder: '',
    sortAscendingOperationText: 'cliquer pour trier par ordre croissant',
    sortCancelOperationText: 'cliquer pour annuler le tri',
    sortDescendingOperationText: 'cliquer pour trier par ordre décroissant',
    clearFilterResultButtonText: 'Effacer',
    columnConfigButtonText: 'Colonnes',
    columnConfigTitleText: 'Colonnes du tableau',
    columnConfigDescriptionText: 'Choisissez les colonnes à afficher',
    confirmText: 'Valider',
    cancelText: 'Annuler',
    resetText: 'Réinitialiser',
    selectAllText: 'Tout sélectionner',
    searchResultText:
      'Recherche « {result} » : aucun résultat. | Recherche « {result} » : 1 résultat. | Recherche « {result} » : {count} résultats.',
  },
  select: { empty: 'Aucune donnée', loadingText: 'chargement…', placeholder: 'Choisir' },
  tree: { empty: 'Aucune donnée' },
  treeSelect: { empty: 'Aucune donnée', loadingText: 'chargement…', placeholder: 'Choisir' },
  datePicker: {
    dayjsLocale: 'en',
    placeholder: {
      date: 'Choisir une date',
      month: 'Choisir un mois',
      year: 'Choisir une année',
      quarter: 'Choisir un trimestre',
      week: 'Choisir une semaine',
    },
    weekdays: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    months: ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'],
    quarters: ['T1', 'T2', 'T3', 'T4'],
    rangeSeparator: ' - ',
    direction: 'ltr',
    // Format par défaut gardé : sans `valueType`, TDesign l'utilise aussi pour la valeur envoyée.
    format: 'YYYY-MM-DD',
    dayAriaLabel: 'J',
    yearAriaLabel: 'A',
    monthAriaLabel: 'M',
    weekAbbreviation: 'S',
    confirm: 'Valider',
    selectTime: "Choisir l'heure",
    selectDate: 'Choisir la date',
    nextYear: 'Année suivante',
    preYear: 'Année précédente',
    nextMonth: 'Mois suivant',
    preMonth: 'Mois précédent',
    preDecade: 'Décennie précédente',
    nextDecade: 'Décennie suivante',
    now: 'Maintenant',
  },
  upload: {
    sizeLimitMessage: 'Fichier trop volumineux. {sizeLimit}',
    cancelUploadText: 'Annuler',
    triggerUploadText: {
      fileInput: 'Téléverser',
      image: 'Cliquer pour téléverser',
      normal: 'Téléverser',
      reupload: 'Remplacer',
      continueUpload: 'Ajouter',
      delete: 'Supprimer',
      uploading: 'Envoi en cours',
    },
    dragger: {
      dragDropText: 'Déposer ici',
      draggingText: 'Glisser le fichier dans cette zone',
      clickAndDragText: 'Cliquer sur « Téléverser » ou glisser le fichier dans cette zone',
    },
    file: {
      fileNameText: 'nom',
      fileSizeText: 'taille',
      fileStatusText: 'état',
      fileOperationText: 'action',
      fileOperationDateText: 'date',
    },
    progress: { uploadingText: 'Envoi', waitingText: 'En attente', failText: 'Échec', successText: 'Envoyé' },
  },
  form: {
    errorMessage: {
      date: '${name} est invalide',
      url: '${name} est invalide',
      required: '${name} est obligatoire',
      whitespace: '${name} ne peut pas être vide',
      max: '${name} : ${validate} caractères au plus',
      min: '${name} : ${validate} caractères au moins',
      len: '${name} : exactement ${validate} caractères',
      enum: '${name} doit valoir ${validate}',
      idcard: '${name} est invalide',
      telnumber: '${name} est invalide',
      pattern: '${name} est invalide',
      validator: '${name} est invalide',
      boolean: "${name} n'est pas un booléen",
      number: '${name} doit être un nombre',
      email: '${name} est invalide',
    },
    colonText: ' :',
  },
  input: { placeholder: 'Saisir' },
  list: { loadingText: 'chargement…', loadingMoreText: 'chargement de la suite' },
  alert: { expandText: 'afficher', collapseText: 'masquer' },
  anchor: { copySuccessText: 'lien copié', copyText: 'copier le lien' },
  colorPicker: {
    swatchColorTitle: 'Couleurs par défaut',
    recentColorTitle: 'Utilisées récemment',
    clearConfirmText: 'Effacer les couleurs récentes ?',
    singleColor: 'Unie',
    gradientColor: 'Dégradé',
  },
  guide: {
    finishButtonProps: { content: 'Terminer', theme: 'primary' },
    nextButtonProps: { content: 'Suivant', theme: 'primary' },
    skipButtonProps: { content: 'Passer', theme: 'default' },
    prevButtonProps: { content: 'Précédent', theme: 'default' },
  },
  image: { errorText: 'image indisponible', loadingText: 'chargement' },
  imageViewer: {
    errorText: 'image indisponible',
    mirrorTipText: 'miroir',
    rotateTipText: 'pivoter',
    originalSizeTipText: 'taille réelle',
    previewText: 'aperçu',
  },
  typography: { expandText: 'plus', collapseText: 'moins', copiedText: 'copié' },
  rate: { rateText: ['très mauvais', 'décevant', 'correct', 'satisfaisant', 'excellent'] },
  empty: {
    titleText: {
      maintenance: 'En construction',
      success: 'Réussi',
      fail: 'Échec',
      empty: 'Aucune donnée',
      networkError: 'Erreur réseau',
    },
  },
  descriptions: { colonText: ' :' },
  chat: {
    placeholder: 'Saisir un message…',
    stopBtnText: 'arrêter',
    refreshTipText: 'régénérer',
    copyTipText: 'copier',
    likeTipText: "j'aime",
    dislikeTipText: "je n'aime pas",
    copyCodeBtnText: 'copier le code',
    copyCodeSuccessText: 'copié',
    clearHistoryBtnText: "effacer l'historique",
    copyTextSuccess: 'copié',
    copyTextFail: 'copie impossible',
    confirmClearHistory: 'Effacer tous les messages ?',
    loadingText: 'réflexion…',
    loadingEndText: 'réflexion terminée',
    uploadImageText: 'ajouter une image',
    uploadAttachmentText: 'ajouter une pièce jointe',
    shareTipText: 'partager',
  },
  qrcode: { expiredText: 'expiré', refreshText: 'actualiser', scannedText: 'scanné' },
}

export default frFR
