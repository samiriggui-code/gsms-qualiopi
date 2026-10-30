export const preinscriptionMessages = {
  fr: {
    landing: {
      preinscription: {
        sheetTitle: 'Préinscription',
        sheetDescription: 'Complétez votre dossier candidat.',
        tabs: {
          profile: 'Identité',
          compliance: 'Confirmations',
          project: 'Formation',
        },
        fields: {
          civility: {
            label: 'Civilité',
            placeholder: 'Choisir',
            monsieur: 'Monsieur',
            madame: 'Madame',
          },
          firstName: { label: 'Prénom(s)', placeholder: 'Prénom' },
          lastName: { label: 'Nom de naissance', placeholder: 'Nom' },
          usageName: {
            label: "Nom d'usage",
            placeholder: 'Facultatif',
          },
          email: { label: 'Email', placeholder: 'email@exemple.fr' },
          phone: { label: 'Téléphone', placeholder: '06 00 00 00 00' },
          birthDate: { label: 'Date de naissance' },
          birthCity: { label: 'Ville de naissance', placeholder: 'Lyon' },
          birthDepartment: {
            label: 'Département',
            placeholder: '69, 2A, 75…',
          },
          birthCountry: {
            label: 'Pays de naissance',
            placeholder: 'Algérie, Maroc…',
          },
          nationality: { label: 'Nationalité', placeholder: 'Française' },
          currentSituation: {
            label: 'Situation actuelle',
            placeholder: 'Salarié, demandeur d\'emploi…',
          },
          address: { label: 'Adresse', placeholder: 'Numéro et rue' },
          postalCode: { label: 'Code postal', placeholder: '75001' },
          city: { label: 'Commune', placeholder: 'Paris' },
          formation: {
            label: 'Formation',
            placeholder: 'Choisir une formation',
          },
          funding: {
            label: 'Financement',
            placeholder: 'Choisir',
          },
          session: {
            label: 'Session (optionnel)',
            loadingPlaceholder: 'Chargement…',
            placeholder: 'Choisir une session',
            flexibleOption: 'Dates à convenir',
            flexiblePlaceholder: 'Ex. mai 2026',
            fullSuffix: ' (complet)',
            closedSuffix: ' (fermé)',
          },
          experience: {
            label: 'Expérience (optionnel)',
            placeholder: 'Sécurité, incendie…',
          },
          motivation: {
            label: 'Motivation (optionnel)',
            placeholder: 'Votre objectif',
          },
        },
        funding: {
          cpf: 'CPF',
          transition: 'Transition professionnelle',
          opco: 'OPCO / employeur',
          franceTravail: 'France Travail / AIF',
          selfFunded: 'Autofinancement',
          apprenticeship: 'Apprentissage / pro.',
          discuss: 'À définir avec l\'école',
        },
        compliance: {
          hasValidIdentityDocument: "Je dispose d'une pièce d'identité valide.",
          hasNoIncompatibleConviction: 'Aucune condamnation incompatible avec le métier.',
          meetsFormationPrerequisites: 'Je réponds aux prérequis de la formation.',
          acceptsInternalRules: "J'accepte le règlement intérieur.",
          acknowledgesCnapsHandledBySchool: "L'école gère la demande CNAPS.",
          certifiesInformationAccuracy: 'Les informations sont exactes.',
        },
        actions: {
          cancel: 'Annuler',
          submit: 'Envoyer ma candidature',
          submitting: 'Envoi…',
        },
        toasts: {
          success: 'Candidature enregistrée. Nous vous recontactons rapidement.',
          errorGeneric: 'Une erreur est survenue.',
          saveFailed: 'Enregistrement impossible.',
        },
      },
    },
  },
  en: {
    landing: {
      preinscription: {
        sheetTitle: 'Pre-registration',
        sheetDescription: 'Complete your application.',
        tabs: {
          profile: 'Identity',
          compliance: 'Confirmations',
          project: 'Training',
        },
        fields: {
          civility: {
            label: 'Title',
            placeholder: 'Choose',
            monsieur: 'Mr',
            madame: 'Mrs',
          },
          firstName: { label: 'First name(s)', placeholder: 'First name' },
          lastName: { label: 'Birth surname', placeholder: 'Surname' },
          usageName: {
            label: 'Usage name',
            placeholder: 'Optional',
          },
          email: { label: 'Email', placeholder: 'email@example.com' },
          phone: { label: 'Phone', placeholder: '06 00 00 00 00' },
          birthDate: { label: 'Date of birth' },
          birthCity: { label: 'City of birth', placeholder: 'Lyon' },
          birthDepartment: {
            label: 'Department',
            placeholder: '69, 2A, 75…',
          },
          birthCountry: {
            label: 'Country of birth',
            placeholder: 'Algeria, Morocco…',
          },
          nationality: { label: 'Nationality', placeholder: 'French' },
          currentSituation: {
            label: 'Current situation',
            placeholder: 'Employed, job seeker…',
          },
          address: { label: 'Address', placeholder: 'Street address' },
          postalCode: { label: 'Postcode', placeholder: '75001' },
          city: { label: 'City', placeholder: 'Paris' },
          formation: {
            label: 'Training programme',
            placeholder: 'Choose a programme',
          },
          funding: {
            label: 'Funding',
            placeholder: 'Choose',
          },
          session: {
            label: 'Session (optional)',
            loadingPlaceholder: 'Loading…',
            placeholder: 'Choose a session',
            flexibleOption: 'Dates to be agreed',
            flexiblePlaceholder: 'E.g. May 2026',
            fullSuffix: ' (full)',
            closedSuffix: ' (closed)',
          },
          experience: {
            label: 'Experience (optional)',
            placeholder: 'Security, fire safety…',
          },
          motivation: {
            label: 'Motivation (optional)',
            placeholder: 'Your goal',
          },
        },
        funding: {
          cpf: 'CPF',
          transition: 'Career transition',
          opco: 'OPCO / employer',
          franceTravail: 'France Travail / AIF',
          selfFunded: 'Self-funded',
          apprenticeship: 'Apprenticeship',
          discuss: 'To discuss with the school',
        },
        compliance: {
          hasValidIdentityDocument: 'I hold a valid identity document.',
          hasNoIncompatibleConviction: 'No conviction incompatible with the profession.',
          meetsFormationPrerequisites: 'I meet the training prerequisites.',
          acceptsInternalRules: 'I accept the internal regulations.',
          acknowledgesCnapsHandledBySchool: 'The school handles the CNAPS application.',
          certifiesInformationAccuracy: 'The information provided is accurate.',
        },
        actions: {
          cancel: 'Cancel',
          submit: 'Submit application',
          submitting: 'Submitting…',
        },
        toasts: {
          success: 'Application recorded. We will contact you shortly.',
          errorGeneric: 'An error occurred.',
          saveFailed: 'Unable to save.',
        },
      },
    },
  },
} as const;
