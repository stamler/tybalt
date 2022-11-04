<template>
  <div>
    <div id="spacer"></div>
    <div class="actions">
      <action-button @click="signOutWrapper" :color="'000'">
        Sign Out
      </action-button>
      <WaitMessages v-if="showTasks" />
    </div>
    <div id="dash">
      <h2>Hi, {{ user.displayName }}</h2>
      <img alt="TBTE logo" src="../assets/logo.png" />
      <div class="infobox">
        <h3>Balances</h3>
        <h4 v-if="item.usedAsOf !== null">
          Available time off as of {{ item.usedAsOf | shortDate }}
        </h4>
        <h4 v-else>Available time off</h4>
        <p>Vacation: {{ item.openingOV - item.usedOV }} hr(s)</p>
        <p>PPTO: {{ item.openingOP - item.usedOP }} hr(s)</p>
        <p>
          Company policy requires the use of vacation time prior to using PPTO
        </p>
        <br />
        <h4 v-if="item.mileageClaimedSince !== undefined">
          Mileage Claimed since
          {{ shortDate(item.mileageClaimedSince.toDate()) }}
        </h4>
        <p>{{ item.mileageClaimed }} km</p>
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
          <select class="grow" name="manager" v-model="item.managerUid">
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
            v-model="item.defaultDivision"
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
            v-model="item.doNotAcceptSubmissions"
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
            v-model="item.alternateManager"
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
    <div style="text-align: right">v{{ VERSION }}</div>
  </div>
</template>
<script lang="ts">
import { LIB_VERSION } from "../version";
import Vue from "vue";
import { signOut } from "../main";
import firebase from "../firebase";
import ActionButton from "./ActionButton.vue";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { generateKeypair } from "./wireguard";
import { shortDate, downloadBlob } from "./helpers";
import { useStateStore } from "../stores/state";
import WaitMessages from "./WaitMessages.vue";
const db = firebase.firestore();

export default Vue.extend({
  setup() {
    const stateStore = useStateStore();
    const showTasks = stateStore.showTasks;
    // TODO: similar to WelcomeSettings.vue, can't figure out why this is
    // undefined using storeToRefs but it works this way
    const user = stateStore.user;
    const { startTask, endTask } = stateStore;
    return { user, showTasks, startTask, endTask };
  },
  components: { ActionButton, WaitMessages },
  data() {
    return {
      VERSION: LIB_VERSION,
      item: {} as firebase.firestore.DocumentData,
      managers: [] as firebase.firestore.DocumentData[],
      divisions: [] as firebase.firestore.DocumentData[],
      wireguardClients: [] as firebase.firestore.DocumentData[],
    };
  },
  computed: {
    isManager(): boolean {
      return this.item?.customClaims?.tapr === true;
    },
  },
  created() {
    this.$bind("managers", db.collection("ManagerNames"));
    this.$bind("divisions", db.collection("Divisions"));
    this.$bind(
      "wireguardClients",
      db.collection("WireGuardClients").where("uid", "==", this.user.uid)
    );
    this.setItem(this.user.uid);
  },
  methods: {
    shortDate,
    snip(str: string): string {
      const first_n = 5;
      const last_n = 5;
      return (
        str.substring(0, first_n) + "..." + str.substring(str.length - last_n)
      );
    },
    async generateWireguardConfigAndDownload(
      client: firebase.firestore.DocumentData
    ) {
      const { privateKey, publicKey } = generateKeypair();

      // Upload the public key to the server.
      const wgSetPublicKey = firebase
        .functions()
        .httpsCallable("wgSetPublicKey");
      this.startTask({
        id: "setPublicKey",
        message: "setting public key...",
      });
      await wgSetPublicKey({
        id: client.id,
        publicKey,
      })
        .then(() => {
          this.endTask("setPublicKey");
        })
        .catch((error) => {
          this.endTask("setPublicKey");
          alert(`Error setting public key: ${error.message}`);
        });

      const configDirScript = `$configPath = "C:\\Program Files\\WireGuard\\Data\\Configurations"
if ((Test-Path $configPath) -eq $False) { 
  # Create directory if it doesn't exist
  New-Item $configPath -ItemType Directory
}
$profileName = "TBTE"
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
$configFile | Out-File -FilePath "$configPath\\TBTE.conf" -Encoding ASCII
Remove-Item $PSCommandPath
`;

      // Create registry keys so non-admin user can activate/deactivate tunnel
      const nonAdminScript = `
if ((Test-Path 'HKLM:\\Software\\WireGuard\\') -eq $False) {
  # Create registry key if it doesn't exist
  New-Item 'HKLM:\\Software\\WireGuard\\'
}
New-ItemProperty 'HKLM:\\Software\\WireGuard' -Name 'LimitedOperatorUI' -Value 1 -PropertyType 'DWord' -Force
Add-LocalGroupMember -Group 'Network Configuration Operators' -Member 'TBTE\\${client.samAccountName}'
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
    },
    signOut,
    async signOutWrapper() {
      // wrap the signOut because it was causing issues of not working at all
      // may be because the function depended on async stuff being loaded
      // but it's not clear why
      signOut();
    },
    setItem(id: string) {
      if (id) {
        db.collection("Profiles")
          .doc(id)
          .get()
          .then((snap: firebase.firestore.DocumentSnapshot) => {
            const result = snap.data();
            if (result === undefined) {
              // A document with this id doesn't exist in the database,
              // list instead.
              alert(`No profile found for user id ${id}`);
            } else {
              this.item = result;
            }
          })
          .catch(() => {
            alert(`Error loading profile for user id ${id}`);
          });
      } else {
        this.item = {};
      }
    },
    save(): void {
      // Editing an existing item
      // Since the UI binds existing id to the key field, no need to delete
      const obj: {
        defaultDivision: string;
        managerUid: string;
        doNotAcceptSubmissions?: boolean;
        alternateManager?: string;
      } = {
        defaultDivision: this.item.defaultDivision,
        managerUid: this.item.managerUid,
      };
      if (typeof this.item.doNotAcceptSubmissions === "boolean") {
        obj.doNotAcceptSubmissions = this.item.doNotAcceptSubmissions;
      }
      if (typeof this.item.alternateManager === "string") {
        obj.alternateManager = this.item.alternateManager;
      }
      db.collection("Profiles")
        .doc(this.user.uid)
        .set(obj, { merge: true })
        .then(signOut);
    },
  },
});
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
