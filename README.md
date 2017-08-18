## Cisco AMP for Endpoints Splunk ES Integration Add-on development instructions

Cisco AMP for Endpoints Splunk ES Integration Add-on provides a mechanism to map data from AMP
data into Splunk Enterprise Security, using the Splunk Common Information Model
Add-on. It also adds some workflow actions for AMP.

### Prerequisites
* A local instance of Splunk Enterprise
* [Splunk Common Information Model (CIM)](https://splunkbase.splunk.com/app/1621/)

### Installation
1. Clone the repository
2. Copy or link it to `$SPLUNK_HOME/etc/apps/TA-cisco-amp4e`
3. Restart Splunk
4. Set up the application (Apps->Manage apps->Splunk Add-on for Cisco AMP4E->Set up)

### Contributing
If you've developed a feature, don't hesitate to submit a pull request for review!
Please make sure your code is properly documented and tested (if needed), as it will facilitate fast reviewing.  

### Authors
This project was developed by Cisco AMP For Endpoints team

### License
This project is licensed under the BSD 2-clause "Simplified" License - see the [LICENSE](LICENSE) file for details

### Acknowledgments
* Brian from Northern Trust
