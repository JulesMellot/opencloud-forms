import openCloudConfig from '@opencloud-eu/eslint-config'

export default [...openCloudConfig, { ignores: ['dist/**', '.__mf__temp/**'] }]
