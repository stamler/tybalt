<template>
  <div>
    <div id="spacer"></div>
    <div class="actions">
      <action-button @click="signOutWrapper" :color="'000'">
        Sign Out
      </action-button>
      <WaitMessages v-if="showTasks" />
    </div>
    <div id="dash" v-if="profileDoc !== null && profileDoc !== undefined">
      <h2>Hi, {{ user.displayName }}</h2>
      <img alt="Company logo" src="../assets/logo.png" />
      <div class="infobox">
        <h3>Balances</h3>
        <h4 v-if="profileDoc.usedAsOf !== undefined && profileDoc.usedAsOf !== null">
          Available time off as of {{ shortDate(profileDoc.usedAsOf.toDate()) }}
        </h4>
        <h4 v-else>Available time off</h4>
        <p>Vacation: {{ profileDoc.openingOV - profileDoc.usedOV }} hr(s)</p>
        <p>PPTO: {{ profileDoc.openingOP - profileDoc.usedOP }} hr(s)</p>
        <p>
          Company policy requires the use of vacation time prior to using PPTO
        </p>
        <br />
        <h4
          v-if="
            profileDoc.mileageClaimedSince !== undefined &&
            profileDoc.mileageClaimedSince !== null
          "
        >
          Mileage Claimed since
          {{ shortDate(profileDoc.mileageClaimedSince.toDate()) }}
        </h4>
        <p>{{ profileDoc.mileageClaimed }} km</p>
      </div>
      <div class="infobox" v-if="wireguardClients.length > 0">
        <h3>WireGuard configs</h3>
        <ul>
          <li v-for="client in wireguardClients" :key="client.computerName">
            {{ client.computerName }}
            <span class="label" v-if="!client.enabled">disabled</span>
            <action-button
              type="download"
              v-if="client.PublicKey === undefined"
              @click="generateWireguardConfigAndDownload(client)"
            />
            <span v-else>{{ snip(client.PublicKey) }}</span>
          </li>
        </ul>
      </div>
      <form id="editor">
        <h3>Settings</h3>
        <h4>Time Sheets</h4>
        <span class="field" title="The manager who will approve your timesheet">
          <label for="manager">Manager</label>
          <select class="grow" name="manager" v-model="profileDoc.managerUid">
            <option v-for="m in managers" :value="m.id" v-bind:key="m.id">
              {{ m.displayName }}
            </option>
          </select>
        </span>
        <span
          class="field"
          title="New Time Entries will be use this division by default"
        >
          <label for="defaultDivision">Default Division</label>
          <select
            class="grow"
            name="defaultDivision"
            v-model="profileDoc.defaultDivision"
          >
            <option v-for="d in divisions" :value="d.id" v-bind:key="d.id">
              {{ d.name }}
            </option>
          </select>
        </span>
        <span
          class="field"
          v-if="isManager"
          title="Prevent staff from submitting timesheets and expenses to you"
        >
          <label for="doNotAcceptSubmissions">Block Submissions</label>
          <input
            class="grow"
            type="checkbox"
            name="doNotAcceptSubmissions"
            v-model="profileDoc.doNotAcceptSubmissions"
          />
        </span>
        <span
          class="field"
          v-if="isManager"
          title="Who should receive time and expenses when you're not available?"
        >
          <label for="alternateManager">Alternate Manager</label>
          <select
            class="grow"
            name="alternateManager"
            v-model="profileDoc.alternateManager"
          >
            <option v-for="m in managers" :value="m.id" v-bind:key="m.id">
              {{ m.displayName }}
            </option>
          </select>
        </span>
        <span class="field">
          <button type="button" v-on:click="save()">Save and sign out</button>
        </span>
        <br />
        <p>
          If you save changes here, you will be signed out and changes will take
          effect when you next sign in.
        </p>
      </form>
    </div>
    <div v-else>
      <h2>Loading...</h2>
    </div>
    <div style="text-align: right">v{{ LIB_VERSION }}</div>
  </div>
</template>
<script setup lang="ts">
import { LIB_VERSION } from "@/version";
import { computed } from "vue";
import { firebaseApp } from "@/firebase";
import { Profile } from "./types";
import {
  getFirestore,
  collection,
  query,
  where,
  doc,
  setDoc,
  DocumentData,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import ActionButton from "./ActionButton.vue";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { generateKeypair } from "./wireguard";
import { shortDate, downloadBlob } from "./helpers";
import { useStateStore } from "@/stores/state";
import WaitMessages from "./WaitMessages.vue";
import { useCollection, useDocument } from "vuefire";
import { storeToRefs } from "pinia";
import { COMPANY_SHORTNAME } from "@/config";
const db = getFirestore(firebaseApp);

const stateStore = useStateStore();
const { user, showTasks } = storeToRefs(stateStore);
// user has no type information when accessing this.user.uid below
// this discussion may be relevant:
// https://github.com/vuejs/pinia/discussions/1178

const profileDoc = useDocument<Profile>(doc(db, "Profiles", user.value.uid || "default"));
const managers = useCollection(collection(db, "ManagerNames"));
const divisions = useCollection(collection(db, "Divisions"));
const wireguardClients = useCollection(
  query(
    collection(db, "WireGuardClients"),
    where("uid", "==", user.value.uid || "default")
  )
);

const isManager = computed(() => {
  return profileDoc.value?.customClaims?.tapr === true;
});

const snip = function (str: string): string {
  const first_n = 5;
  const last_n = 5;
  return (
    str.substring(0, first_n) + "..." + str.substring(str.length - last_n)
  );
};

const generateWireguardConfigAndDownload = async function(client: DocumentData) {
  const { privateKey, publicKey } = generateKeypair();

  // Upload the public key to the server.
  const functions = getFunctions(firebaseApp);
  const wgSetPublicKey = httpsCallable(functions, "wgSetPublicKey");
  stateStore.startTask({
    id: "setPublicKey",
    message: "setting public key...",
  });
  await wgSetPublicKey({
    id: client.id,
    publicKey,
  })
    .then(() => {
      stateStore.endTask("setPublicKey");
    })
    .catch((error) => {
      stateStore.endTask("setPublicKey");
      alert(`Error setting public key: ${error.message}`);
    });

  const configDirScript = `$configPath = "C:\\Program Files\\WireGuard\\Data\\Configurations"
if ((Test-Path $configPath) -eq $False) { 
# Create directory if it doesn't exist
New-Item $configPath -ItemType Directory
}
$profileName = "${COMPANY_SHORTNAME}"
if ((Test-Path "$configPath\\$profileName.conf.dpapi") -eq $True) {
# Delete existing profile
Remove-Item "$configPath\\$profileName.conf.dpapi"
}
`;
  // Build the config file
  const configFile = `[Interface]
Address = ${client.id}
PrivateKey = ${privateKey}
DNS = ${client.Interface.DNS}

[Peer]
PublicKey = ${client.Peer.PublicKey}
AllowedIPs = ${client.Peer.AllowedIPs}
Endpoint = ${client.Peer.Endpoint}
`;

  const configVarAssignment = `$configFile = "${configFile}"`;

  const writeConfigFileScript = `
$configFile | Out-File -FilePath "$configPath\\${COMPANY_SHORTNAME}.conf" -Encoding ASCII
Remove-Item $PSCommandPath
`;

  // Create registry keys so non-admin user can activate/deactivate tunnel
  const nonAdminScript = `
if ((Test-Path 'HKLM:\\Software\\WireGuard\\') -eq $False) {
# Create registry key if it doesn't exist
New-Item 'HKLM:\\Software\\WireGuard\\'
}
New-ItemProperty 'HKLM:\\Software\\WireGuard' -Name 'LimitedOperatorUI' -Value 1 -PropertyType 'DWord' -Force
Add-LocalGroupMember -Group 'Network Configuration Operators' -Member '${COMPANY_SHORTNAME}\\${client.samAccountName}'
`;
  const blob = new Blob(
    [
      configDirScript +
        configVarAssignment +
        writeConfigFileScript +
        nonAdminScript,
    ],
    { type: "text/plain" }
  );

  downloadBlob(blob, "SetupWireguard.ps1");
};

const signOutWrapper = async function () {
  // wrap the signOut because it was causing issues of not working at all
  // may be because the function depended on async stuff being loaded
  // but it's not clear why
  console.debug("signOutWrapper");
  stateStore.signOutTybalt();
};

const save = function (): void {
  // Editing an existing item
  // Since the UI binds existing id to the key field, no need to delete
  const obj: {
    defaultDivision: string;
    managerUid: string;
    doNotAcceptSubmissions?: boolean;
    alternateManager?: string;
  } = {
    defaultDivision: profileDoc.value?.defaultDivision || "",
    managerUid: profileDoc.value?.managerUid || "",
  };
  if (typeof profileDoc.value?.doNotAcceptSubmissions === "boolean") {
    obj.doNotAcceptSubmissions = profileDoc.value?.doNotAcceptSubmissions;
  }
  if (typeof profileDoc.value?.alternateManager === "string") {
    obj.alternateManager = profileDoc.value?.alternateManager;
  }
  setDoc(doc(db, "Profiles", user.value.uid), obj, { merge: true })
    .then(stateStore.signOutTybalt)
    .catch((error) => {
      alert(`Error saving profile: ${error.message}`);
    });
};
</script>
<style>
#dash {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
#dash img,
h2 {
  align-self: center;
}
#spacer {
  background-color: rgb(255, 163, 51);
  flex: 0 0 3em;
}
.infobox {
  width: 100%;
  padding: 0em 0.4em;
  margin-bottom: 2em;
  background-color: ivory;
}
li {
  list-style-type: none;
}
</style>
