"use strict";

define(
    ["backbone", "jquery", "splunkjs/splunk"],
    function (Backbone, jquery, splunk_js_sdk) {
        sdk = splunk_js_sdk;
        let splunk_js_sdk_service;

        const app_name = "amp4e_splunk_cim_add_on";

        const application_name_space = {
            owner: "nobody",
            app: app_name,
            sharing: "app",
        };

        var SetupView = Backbone.View.extend({
            // -----------------------------------------------------------------
            // Backbone Functions, These are specific to the Backbone library
            // -----------------------------------------------------------------
            initialize: function initialize() {
                Backbone.View.prototype.initialize.apply(this, arguments);
                splunk_js_sdk_service = this.create_splunk_js_sdk_service(
                    splunk_js_sdk,
                    application_name_space,
                );
            },

            events: {
                "click #setup_button": "trigger_setup",
            },

            render: async function () {
                this.el.innerHTML = this.get_template();
                await this.fetchDefaultUiValues();
                return this;
            },

            fetchDefaultUiValues: async function() {

                const configuration_file_name = "appsetup";
                const stanza_name = "app_config";

                // Retrieve the accessor used to get a configuration file
                var splunk_js_sdk_service_configurations = splunk_js_sdk_service.configurations({
                    // Name space information not provided
                }, );
                await splunk_js_sdk_service_configurations.fetch();

                // Check for the existence of the configuration file being editect
                var does_configuration_file_exist = this.does_configuration_file_exist(
                    splunk_js_sdk_service_configurations,
                    configuration_file_name,
                );

                // If the configuration file doesn't exist, create it
                if (!does_configuration_file_exist) {
                    return;
                }

                // Retrieves the configuration file accessor
                var configuration_file_accessor = this.get_configuration_file(
                    splunk_js_sdk_service_configurations,
                    configuration_file_name,
                );
                await configuration_file_accessor.fetch();

                // Checks to see if the stanza where the inputs will be
                // stored exist
                var does_stanza_exist = this.does_stanza_exist(
                    configuration_file_accessor,
                    stanza_name,
                );

                // If the configuration stanza doesn't exist, create it
                if (!does_stanza_exist) {
                    return;
                }
                // Need to update the information after the creation of the stanza
                await configuration_file_accessor.fetch();

                // Retrieves the configuration stanza accessor
                var configuration_stanza_accessor = this.get_configuration_file_stanza(
                    configuration_file_accessor,
                    stanza_name,
                );
                await configuration_stanza_accessor.fetch();
                
                console.log("CONFIG PROPS");
                let props = configuration_stanza_accessor.properties();

                // Update the UI for amp_host
                let apm_endpoint_input_element = jquery("input[name=amp_host]");
                apm_endpoint_input_element.val(props.amp_host);
            },

            // -----------------------------------------------------------------
            // Custom Functions, These are unrelated to the Backbone functions
            // -----------------------------------------------------------------
            // ----------------------------------
            // Main Setup Logic
            // ----------------------------------
            // This performs some sanity checking and cleanup on the inputs that
            // the user has provided before kicking off main setup process
            trigger_setup: function trigger_setup() {
                // Used to hide the error output, when a setup is retried
                this.display_error_output([]);

                console.log("Triggering setup");
                let apm_endpoint_input_element = jquery("input[name=amp_host]");
                let apm_endpoint = apm_endpoint_input_element.val();

                let sanitized_apm_endpoint = this.sanitize_string(apm_endpoint);

                let error_messages_to_display = this.validate_inputs(
                    sanitized_apm_endpoint
                );

                let did_error_messages_occur = error_messages_to_display.length > 0;
                if (did_error_messages_occur) {
                    // Displays the errors that occurred input validation
                    console.log("ERRORS: ", error_messages_to_display)
                    this.display_error_output(error_messages_to_display);
                } else {

                    console.log("FULLY QUAL URL: ", sanitized_apm_endpoint)

                    this.perform_setup(
                        splunk_js_sdk,
                        sanitized_apm_endpoint
                    );
                }
            },

            // This is where the main setup process occurs
            perform_setup: async function perform_setup(splunk_js_sdk, api_url) {

                try {
                    // Create the Splunk JS SDK Service object
                    // splunk_js_sdk_service = this.create_splunk_js_sdk_service(
                    //     splunk_js_sdk,
                    //     application_name_space,
                    // );

                    await this.updateAppConf(splunk_js_sdk_service, api_url);
                    await this.updateWorkflowActions(splunk_js_sdk_service, api_url);

                    // Completes the setup, by access the app.conf's [install]
                    // stanza and then setting the `is_configured` to true
                    await this.complete_setup(splunk_js_sdk_service);

                    // Reloads the splunk app so that splunk is aware of the
                    // updates made to the file system
                    await this.reload_splunk_app(splunk_js_sdk_service, app_name);

                    // Redirect to the Splunk App's home page
                    // this.redirect_to_splunk_app_homepage(app_name);
                    alert("Successfully saved");
                } catch (error) {
                    // This could be better error catching.
                    // Usually, error output that is ONLY relevant to the user
                    // should be displayed. This will return output that the
                    // user does not understand, causing them to be confused.
                    var error_messages_to_display = [];
                    if (
                        error !== null &&
                        typeof error === "object" &&
                        error.hasOwnProperty("responseText")
                    ) {
                        var response_object = JSON.parse(error.responseText);
                        error_messages_to_display = this.extract_error_messages(
                            response_object.messages,
                        );
                    } else {
                        // Assumed to be string
                        error_messages_to_display.push(error);
                    }

                    this.display_error_output(error_messages_to_display);
                }
            },

            updateAppConf: async function(splunk_js_sdk_service, url) {
                const app_name = "amp4e_splunk_cim_add_on";
                const configuration_file_name = "appsetup";
                const stanza_name = "app_config";
                const properties_to_update = {
                    amp_host: url,
                };

                await this.update_configuration_file(
                    splunk_js_sdk_service,
                    configuration_file_name,
                    stanza_name,
                    properties_to_update,
                );
            },

            updateWorkflowActions: async function(splunk_js_sdk_service, hostName) {
                const FIELD_CONNECTOR_GUID = 'event.computer.connector_guid';
                const FIELD_GROUP_GUIDS = 'event.group_guids{}';
                const FIELD_FILE_SHA256 = 'event.file.identity.sha256';

                const WORKFLOW_ACTIONS = {
                    'cisco_amp_portal_device_trajectory': `/computers/$${FIELD_CONNECTOR_GUID}$/trajectory`,
                    'cisco_amp_portal_device_group': `/groups?search%5Bguid_eq%5D=$${FIELD_GROUP_GUIDS}$`,
                    'cisco_amp_portal_file_trajectory': `/file/trajectory/$${FIELD_FILE_SHA256}$`
                };

                Object.entries(WORKFLOW_ACTIONS).forEach(async ([stanza, url]) => {
                    var app_name = "amp4e_splunk_cim_add_on";
                    var configuration_file_name = "workflow_actions";
                    var stanza_name = stanza;
                    
                    let actionUrl = `https://${hostName}${url}`;

                    var properties_to_update = {
                        'link.uri': actionUrl
                    };


                    await this.update_configuration_file(
                        splunk_js_sdk_service,
                        configuration_file_name,
                        stanza_name,
                        properties_to_update,
                    );
                });

            },

            complete_setup: async function complete_setup(splunk_js_sdk_service) {
                var app_name = "amp4e_splunk_cim_add_on";
                var configuration_file_name = "app";
                var stanza_name = "install";
                var properties_to_update = {
                    is_configured: "true",
                };

                await this.update_configuration_file(
                    splunk_js_sdk_service,
                    configuration_file_name,
                    stanza_name,
                    properties_to_update,
                );
            },

            reload_splunk_app: async function reload_splunk_app(
                splunk_js_sdk_service,
                app_name,
            ) {
                var splunk_js_sdk_apps = splunk_js_sdk_service.apps();
                await splunk_js_sdk_apps.fetch();

                var current_app = splunk_js_sdk_apps.item(app_name);
                current_app.reload();
            },

            // ----------------------------------
            // Splunk JS SDK Helpers
            // ----------------------------------
            // ---------------------
            // Process Helpers
            // ---------------------
            update_configuration_file: async function update_configuration_file(
                splunk_js_sdk_service,
                configuration_file_name,
                stanza_name,
                properties,
            ) {
                // Retrieve the accessor used to get a configuration file
                var splunk_js_sdk_service_configurations = splunk_js_sdk_service.configurations(
                    {
                        // Name space information not provided
                    },
                );
                await splunk_js_sdk_service_configurations.fetch();

                // Check for the existence of the configuration file being editect
                var does_configuration_file_exist = this.does_configuration_file_exist(
                    splunk_js_sdk_service_configurations,
                    configuration_file_name,
                );

                // If the configuration file doesn't exist, create it
                if (!does_configuration_file_exist) {
                    await this.create_configuration_file(
                        splunk_js_sdk_service_configurations,
                        configuration_file_name,
                    );
                }

                // Retrieves the configuration file accessor
                var configuration_file_accessor = this.get_configuration_file(
                    splunk_js_sdk_service_configurations,
                    configuration_file_name,
                );
                await configuration_file_accessor.fetch();

                // Checks to see if the stanza where the inputs will be
                // stored exist
                var does_stanza_exist = this.does_stanza_exist(
                    configuration_file_accessor,
                    stanza_name,
                );

                // If the configuration stanza doesn't exist, create it
                if (!does_stanza_exist) {
                    await this.create_stanza(configuration_file_accessor, stanza_name);
                }
                // Need to update the information after the creation of the stanza
                await configuration_file_accessor.fetch();

                // Retrieves the configuration stanza accessor
                var configuration_stanza_accessor = this.get_configuration_file_stanza(
                    configuration_file_accessor,
                    stanza_name,
                );
                await configuration_stanza_accessor.fetch();

                // We don't care if the stanza property does or doesn't exist
                // This is because we can use the
                // configurationStanza.update() function to create and
                // change the information of a property
                await this.update_stanza_properties(
                    configuration_stanza_accessor,
                    properties,
                );
            },

            // ---------------------
            // Existence Functions
            // ---------------------
            does_configuration_file_exist: function does_configuration_file_exist(
                configurations_accessor,
                configuration_file_name,
            ) {
                var was_configuration_file_found = false;

                var configuration_files_found = configurations_accessor.list();
                for (var index = 0; index < configuration_files_found.length; index++) {
                    var configuration_file_name_found =
                        configuration_files_found[index].name;
                    if (configuration_file_name_found === configuration_file_name) {
                        was_configuration_file_found = true;
                    }
                }

                return was_configuration_file_found;
            },

            does_stanza_exist: function does_stanza_exist(
                configuration_file_accessor,
                stanza_name,
            ) {
                var was_stanza_found = false;

                var stanzas_found = configuration_file_accessor.list();
                for (var index = 0; index < stanzas_found.length; index++) {
                    var stanza_found = stanzas_found[index].name;
                    if (stanza_found === stanza_name) {
                        was_stanza_found = true;
                    }
                }

                return was_stanza_found;
            },

            does_stanza_property_exist: function does_stanza_property_exist(
                configuration_stanza_accessor,
                property_name,
            ) {
                var was_property_found = false;

                for (const [key, value] of Object.entries(
                    configuration_stanza_accessor.properties(),
                )) {
                    if (key === property_name) {
                        was_property_found = true;
                    }
                }

                return was_property_found;
            },

            // ---------------------
            // Retrieval Functions
            // ---------------------
            get_configuration_file: function get_configuration_file(
                configurations_accessor,
                configuration_file_name,
            ) {
                var configuration_file_accessor = configurations_accessor.item(
                    configuration_file_name,
                    {
                        // Name space information not provided
                    },
                );

                return configuration_file_accessor;
            },

            get_configuration_file_stanza: function get_configuration_file_stanza(
                configuration_file_accessor,
                configuration_stanza_name,
            ) {
                var configuration_stanza_accessor = configuration_file_accessor.item(
                    configuration_stanza_name,
                    {
                        // Name space information not provided
                    },
                );

                return configuration_stanza_accessor;
            },

            get_configuration_file_stanza_property: function get_configuration_file_stanza_property(
                configuration_file_accessor,
                configuration_file_name,
            ) {
                return null;
            },

            // ---------------------
            // Creation Functions
            // ---------------------
            create_splunk_js_sdk_service: function create_splunk_js_sdk_service(
                splunk_js_sdk,
                application_name_space,
            ) {
                var http = new splunk_js_sdk.SplunkWebHttp();

                var splunk_js_sdk_service = new splunk_js_sdk.Service(
                    http,
                    application_name_space,
                );

                return splunk_js_sdk_service;
            },

            create_configuration_file: function create_configuration_file(
                configurations_accessor,
                configuration_file_name,
            ) {
                var parent_context = this;

                return configurations_accessor.create(configuration_file_name, function (
                    error_response,
                    created_file,
                ) {
                    // Do nothing
                });
            },

            create_stanza: function create_stanza(
                configuration_file_accessor,
                new_stanza_name,
            ) {
                var parent_context = this;

                return configuration_file_accessor.create(new_stanza_name, function (
                    error_response,
                    created_stanza,
                ) {
                    // Do nothing
                });
            },

            update_stanza_properties: function update_stanza_properties(
                configuration_stanza_accessor,
                new_stanza_properties,
            ) {
                var parent_context = this;

                return configuration_stanza_accessor.update(
                    new_stanza_properties,
                    function (error_response, entity) {
                        // Do nothing
                    },
                );
            },

            // ----------------------------------
            // Input Cleaning and Checking
            // ----------------------------------
            sanitize_string: function sanitize_string(string_to_sanitize) {
                var sanitized_string = string_to_sanitize.trim();

                return sanitized_string;
            },

            validate_api_url_input: function validate_api_url_input(hostname) {
                var error_messages = [];

                var is_string_empty = typeof hostname === "undefined" || hostname === "";
                var does_string_start_with_http_protocol = hostname.startsWith("http://");
                var does_string_start_with_https_protocol = hostname.startsWith(
                    "https://",
                );

                if (is_string_empty) {
                    error_message =
                        "The `AMP for Endpoitns Console Hostname` specified was empty. Please provide a value.";
                    error_messages.push(error_message);
                }
                if (does_string_start_with_http_protocol) {
                    error_message = 'The hostname should not include the protocol ("http", "https").  This wilil be automatically determined.';
                    error_messages.push(error_message);
                }

                return error_messages;
            },

            validate_inputs: function validate_inputs(hostname) {
                var error_messages = [];

                var api_url_errors = this.validate_api_url_input(hostname);

                error_messages = error_messages.concat(api_url_errors);

                return error_messages;
            },

            // ----------------------------------
            // GUI Helpers
            // ----------------------------------
            extract_error_messages: function extract_error_messages(error_messages) {
                // A helper function to extract error messages

                // Expects an array of messages
                // [
                //     {
                //         type: the_specific_error_type_found,
                //         text: the_specific_reason_for_the_error,
                //     },
                //     ...
                // ]

                var error_messages_to_display = [];
                for (var index = 0; index < error_messages.length; index++) {
                    error_message = error_messages[index];
                    error_message_to_display =
                        error_message.type + ": " + error_message.text;
                    error_messages_to_display.push(error_message_to_display);
                }

                return error_messages_to_display;
            },

            redirect_to_splunk_app_homepage: function redirect_to_splunk_app_homepage(
                app_name,
            ) {
                var redirect_url = "/app/" + app_name;

                window.location.href = redirect_url;
            },

            // ----------------------------------
            // Display Functions
            // ----------------------------------
            display_error_output: function display_error_output(error_messages) {
                // Hides the element if no messages, shows if any messages exist
                var did_error_messages_occur = error_messages.length > 0;

                var error_output_element = jquery(".setup.container .error.output");

                if (did_error_messages_occur) {
                    var new_error_output_string = "";
                    new_error_output_string += "<ul>";
                    for (var index = 0; index < error_messages.length; index++) {
                        new_error_output_string +=
                            "<li>" + error_messages[index] + "</li>";
                    }
                    new_error_output_string += "</ul>";

                    error_output_element.html(new_error_output_string);
                    error_output_element.stop();
                    error_output_element.fadeIn();
                } else {
                    error_output_element.stop();
                    error_output_element.fadeOut({
                        complete: function () {
                            error_output_element.html("");
                        },
                    });
                }
            },

            get_template: function get_template() {
                return `
                    <div class="title">
                        <h1>Setup Page</h1>
                        <div class="setup container">
                            <form>
                                <div class="form-group">
                                    <label for="amp_host">AMP for Endpoints Console Hostname</label>
                                    <input name="amp_host" type="text" class="form-control" id="amp_host" placeholder="console.amp.cisco.com" />
                                    <p class="help-block">
                                        The AMP for Endpoints Console Hostname is used in workflow actions to allow you to pivot into the AMP for Endpoints Console.
                                        <br />
                                        Example: console.amp.cisco.com
                                    </p>
                                </div>
                                <a href="#" id="setup_button" class="btn btn-primary">Save</a>
                                <br />
                                <div class="error output"></div>
                            </form>
                        </div>
                    </div>
                `;
            },
        }); // End of SetupView class declaration

        return SetupView;
    }, // End of require asynchronous module definition function
); // End of require statement
