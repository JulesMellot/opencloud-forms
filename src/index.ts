import '@opencloud-eu/extension-sdk/tailwind.css'
import {
  ApplicationInformation,
  AppWrapperRoute,
  defineWebApplication,
  useClientService
} from '@opencloud-eu/web-pkg'
import { urlJoin } from '@opencloud-eu/web-client'
import { useGettext } from 'vue3-gettext'
import translations from '../l10n/translations.json'
import App from './App.vue'
import PublicForm from './views/PublicForm.vue'
import { createForm, FILE_EXTENSION, serializeForm, type FormLanguage } from './schema'

const applicationId = 'forms'

export default defineWebApplication({
  setup() {
    const gettext = useGettext()
    const { $gettext } = gettext
    const clientService = useClientService()

    const appInfo: ApplicationInformation = {
      name: $gettext('Forms'),
      id: applicationId,
      icon: 'survey',
      color: '#7E57C2',
      defaultExtension: FILE_EXTENSION,
      extensions: [
        {
          extension: FILE_EXTENSION,
          routeName: `${applicationId}-edit`,
          newFileMenu: {
            menuTitle: () => $gettext('Form'),
            defaultName: () => $gettext('New form')
          },
          // a new form is a valid form file from the start, never an empty file
          createFileHandler: ({ fileName, space, currentFolder }) => {
            const form = createForm(fileName.replace(/\.ocform$/, ''))
            const locale = gettext.current.toLowerCase().split(/[-_]/)[0]
            form.settings.spreadsheetLanguage = ['fr', 'es', 'de', 'en'].includes(locale)
              ? (locale as FormLanguage)
              : 'fr'
            return clientService.webdav.putFileContents(space, {
              path: urlJoin(currentFolder.path, fileName),
              content: serializeForm(form)
            })
          }
        }
      ]
    }

    const routes = [
      {
        name: `${applicationId}-edit`,
        path: '/edit/:driveAliasAndItem(.*)?',
        component: AppWrapperRoute(App, { applicationId }),
        meta: {
          authContext: 'user',
          title: $gettext('Forms'),
          patchCleanPath: true
        }
      },
      {
        name: `${applicationId}-public`,
        path: '/p/:token',
        component: PublicForm,
        meta: {
          authContext: 'anonymous',
          title: $gettext('Form')
        }
      }
    ]

    return {
      appInfo,
      routes,
      translations
    }
  }
})
