import store from "@/store";
import firebase from "@/firebase";
import jwt_decode from "jwt-decode";
import axios from "axios";

// TODO: Pull the Azure config from a firebase document
const clientId = "5ce70993-306b-4c1e-a980-ba4139863126";
const tenant = "tbte.onmicrosoft.com";

const unsubscribe = firebase.auth().onAuthStateChanged(async function(user) {
  if (user) {
    console.log(`${user.displayName} is logged in`);
    // set state and user in Vuex
    store.commit("setUser", firebase.auth().currentUser);
    store.commit("setAppStatus", "ready");
  } else {
    store.commit("setAppStatus", "loading"); // set app to loading state

    // no user is signed in, try to extract a token from URL fragment
    const hash = window.location.hash.substring(1);
    const hashParams = hash.split("&").reduce(function(result, item) {
      const parts = item.split("=");
      result[parts[0]] = parts[1];
      return result;
    }, {});
    // erase token url from history TODO: pushState() or replaceState()?
    window.history.pushState({}, "", "/");

    // If id_token was extracted, use it to get a firebase token
    if (hashParams.hasOwnProperty("id_token")) {
      // TODO: should client validate the Azure id_token signature?

      // validate the nonce in the azure id_token against submitted value
      if (
        window.localStorage.nonce != jwt_decode(hashParams["id_token"]).nonce
      ) {
        console.log("nonce in Azure Token doesn't match submitted nonce");
        // TODO: write error to GUI here
      }

      let token;
      try {
        const response = await axios.get(
          "https://us-central1-charade-ca63f.cloudfunctions.net/getToken",
          {
            headers: {
              Authorization: "Bearer " + hashParams["id_token"],
              "Content-Type": "application/json"
            },
            data: {} //blank body necessary to preserve Content-Type header
          }
        );
        token = response.data;
      } catch (error) {
        // TODO: write error to GUI here
        console.log(`AXIOS FAIL: ${error.request} // ${error}`);
      }

      try {
        await firebase.auth().signInWithCustomToken(token);
      } catch (error) {
        // TODO: write error to GUI here
        console.error(error.code + " " + error.message);
      }
    } else {
      // User not authenticated and no token present.

      window.localStorage.setItem("nonce", randomString(32)); // generate nonce

      // Create a request string
      let url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=id_token&scope=openid+profile+email&nonce=${
        window.localStorage.nonce
      }&response_mode=fragment`;
      if (window.location.port === "8080") {
        // Adjust the requested redirectUri for local development
        url = url + "&redirect_uri=http%3A%2F%2Flocalhost%3A8080";
      }

      // Redirect to Azure AD for authentication token
      window.location.href = url;
    }
  }
});

export function signOut(complete = true) {
  unsubscribe();
  firebase.auth().signOut();
  console.log("signed out of firebase");
  // TODO: change application state and/or change name / message
  if (complete) {
    window.location.href = "https://login.windows.net/common/oauth2/logout";
  }
}

function randomString(length) {
  const cset = "0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  if (length > 0) {
    window.crypto.getRandomValues(new Uint8Array(length)).forEach(c => {
      result += cset[c % cset.length];
    });
  }
  return result;
}
