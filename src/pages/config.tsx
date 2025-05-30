import React, { useState } from "react";
import {
    Text,
    Select,
    HStack, Button, Heading,
} from "@chakra-ui/react";
import ConfigEditor from "@/pages/components/ConfigEditor";
import ConfigViewer from "@/pages/components/ConfigViewer";
import {Config} from "@/pages/components/types";
//import yaml from "js-yaml"; // converts JSON to YAML

const ConfigPage: React.FC = () => {
    const [filenames, setFilenames] = useState<string[]>([
        "config.yml",
    ]);
    const [configs, setConfigs] = useState<Config[]>([
        {
            sensors: [
                // Example sensor config.
                {
                    hatID: 0,
                    channelID: 0,
                    name: "POT",
                    unit: "psi",
                    //min: 0,
                    //max: 100,
                    type: "PT",
                    calibration: []
                }
            ],
            relays: [
                // Example relay config.
                {
                    channelID: 0,
                    name: "SVOTD",
                    type: "NC"
                }
            ],
            servos: [
                // Example servo config.
                {
                    channelID: 0,
                    name: "BVOTP",
                    open_pos: 0,
                    open_over: 0,
                    close_pos: 0,
                    close_over: 0,
                    relayID: 0
                }
            ]
        },
    ])

    const [selectedConfig, setSelectedConfig] = useState<Config>({
        sensors: [],
        relays: [],
        servos: []
    });
    const [selectedFilename, setSelectedFilename] = useState("Select a config");

    const [tempConfig, setTempConfig] = useState<Config>(selectedConfig);
    const [tempFilename, setTempFilename] = useState("");

    const [isEditing, setIsEditing] = useState(false);


    const selectConfig = (filename: string) => {
        if (filename === "Select a config") {
            setSelectedFilename("Select a config")
            setTempFilename("");
            setSelectedConfig({
                sensors: [],
                relays: [],
                servos: []
            })
            setTempConfig(selectedConfig);
            cancelConfig();
        }
        if (filename === "New config" || filename === "") {
            setSelectedFilename("");
            setTempFilename(selectedFilename);
            setSelectedConfig({
                sensors: [],
                relays: [],
                servos: []
            });
            setTempConfig(selectedConfig);
            editConfig();
        }
        else {
            setSelectedFilename(filename);
            setTempFilename(selectedFilename);
            setSelectedConfig(configs[filenames.indexOf(filename)]);
            setTempConfig(selectedConfig);
            //setIsEditing(false);
        }

        return;
    }
    const editConfig = () => {
        if (selectedFilename === "Select a config" || selectedFilename === "") {
            setIsEditing(false);
        }
        if (selectedFilename === "New config") {
            setSelectedConfig({
                sensors: [],
                relays: [],
                servos: []
            })
            setTempConfig(selectedConfig);
            setTempFilename("");
            setIsEditing(true);
        }
        else {
            setSelectedConfig(configs[filenames.indexOf(selectedFilename)]);
            setTempConfig(selectedConfig);
            setTempFilename(selectedFilename);
            setIsEditing(true);
        }
    }
    const saveConfig = (config: Config, filename: string) => {
        if (selectedFilename === "New config") {
            setConfigs([...configs, config]);
            setFilenames([...filenames, filename]);
            setSelectedFilename(filename);
            setIsEditing(false);
        }
        else {
            setConfigs(configs.map((item, index) => {
                if (index === filenames.indexOf(selectedFilename)) {
                    return config;
                }
                return item;
            }));
            setFilenames(filenames.map((item, index) => {
                if (index === filenames.indexOf(selectedFilename)) {
                    return filename;
                }
            }))
            setSelectedFilename(filename);
            setIsEditing(false);
        }
    }
    const cancelConfig = () => {
        if (selectedFilename === "Select a config" || selectedFilename === "") {
            setIsEditing(false);
            return;
        }
        if (selectedFilename === "New config") {
            setSelectedConfig({
                sensors: [],
                relays: [],
                servos: []
            })
            setTempConfig(selectedConfig);
            setTempFilename("");
            setIsEditing(false);
        }
        else {
            // setSelectedConfig(configs[filenames.indexOf(selectedFilename)]);
            setTempConfig(selectedConfig);
            setTempFilename(selectedFilename);
            setIsEditing(false);
        }
    }

    return (
        <div style={{position: 'relative', width: '100%', textAlign: 'center'}}>
            <Heading as="h1" mb={6}>
                {isEditing ? "Config File Editor" : "Config File Viewer"}
            </Heading>
            <HStack spacing={4}>
                <Select onChange={(e) => selectConfig(e.target.value)}>
                    <option value="Select a config">Select a config</option>
                    {/*Get Options from filenames*/}
                    {filenames.map((filename, index) => (
                        <option value={filename} key={index} >
                            {filename}
                        </option>
                    ))}

                    {/*Make new config*/}
                    <option value="New config">
                        New config
                    </option>
                </Select>
                {isEditing ?
                    <HStack>
                        <Button colorScheme="green" onClick={() => saveConfig(tempConfig, tempFilename)}>
                            Save Config
                        </Button>
                        <Button colorScheme="red" onClick={() => cancelConfig()}>
                            Cancel
                        </Button>

                    </HStack>
                    :
                    <HStack>
                        <Button
                            colorScheme="blue"
                            onClick={() => setSelectedFilename(selectedFilename)}
                        >
                            Load Config
                        </Button>

                        <Button colorScheme="green" onClick={() => editConfig()}>
                            {selectedFilename === "New config" ? "Add Config" : "Edit Config"}
                        </Button>
                    </HStack>
                }
            </HStack>
            {selectedFilename === "Select a config" ?
                null :
                isEditing ?
                    <ConfigEditor
                        filename={tempFilename} // selectedFilename === "New config" ? "" : selectedFilename}
                        setFilename={setTempFilename}
                        config={tempConfig}
                        setConfig={setTempConfig}
                    /> :
                    <ConfigViewer
                        config={selectedConfig}
                        filename={selectedFilename}
                    />
            }

        </div>
    )
};

export default ConfigPage;