import splunk.admin as admin
import logging
import re

class ConfigApp(admin.MConfigHandler):
    APPSETUP_CONF         = 'appsetup'
    WORKFLOW_ACTIONS_CONF = 'workflow_actions'
    AMP_HOST_FIELD_NAME   = 'amp_host'
    APP_CONFIG_STANZA     = 'app_config'
    LINK_URI_KEY          = 'link.uri'
    HTTPS_PROTOCOL        = 'https://'

    FIELD_CONNECTOR_GUID = 'event.computer.connector_guid'
    FIELD_GROUP_GUIDS    = 'event.group_guids{}'
    FIELD_FILE_SHA256    = 'event.file.identity.sha256'

    WORKFLOW_ACTIONS = {
      'cisco_amp_portal_device_trajectory': '/computers/${0}$/trajectory'.format(FIELD_CONNECTOR_GUID),
      'cisco_amp_portal_device_group':      '/groups?search%5Bguid_eq%5D=${0}$'.format(FIELD_GROUP_GUIDS),
      'cisco_amp_portal_file_trajectory':   '/file/trajectory/${0}$'.format(FIELD_FILE_SHA256)
    }

    def setup(self):
        if self.requestedAction == admin.ACTION_EDIT:
            self.supportedArgs.addOptArg(self.AMP_HOST_FIELD_NAME)

    def handleList(self, confInfo):
        confDict = self.readConf(self.APPSETUP_CONF)

        if confDict != None:
            for stanza, settings in confDict.items():
                for key, val in settings.items():
                    if key == self.AMP_HOST_FIELD_NAME and val in [None, '']:
                        val = ''
                    confInfo[stanza].append(key, val)

    def handleEdit(self, confInfo):
        self.writeConf(self.APPSETUP_CONF, self.APP_CONFIG_STANZA, self.callerArgs.data)
        host = self.callerArgs.data[self.AMP_HOST_FIELD_NAME][0]
        self.updateWorkflowActions(host)

    def updateWorkflowActions(self, hostName):
        for stanza, url in self.WORKFLOW_ACTIONS.iteritems():
            actionUrl = '{0}{1}{2}'.format(self.HTTPS_PROTOCOL, hostName, url)
            self.writeConf(self.WORKFLOW_ACTIONS_CONF, stanza, { self.LINK_URI_KEY: actionUrl })

admin.init(ConfigApp, admin.CONTEXT_NONE)
