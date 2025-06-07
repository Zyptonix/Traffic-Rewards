// app.config.js
import 'dotenv/config'; // This line loads variables from .env into process.env

export default ({ config }) => {
  return {
    ...config, // Spread existing config (if any, typically not much in a new app.config.js)
    // Your existing app.json content goes here, but with environment variables
    // where appropriate.
    expo: {
      name: "Traffic Rewards",
      slug: "traffic-app",
      version: "5.0.0",
      orientation: "portrait",
      icon: "./assets/images/icon.png",
      scheme: "trafficapp",
      userInterfaceStyle: "automatic",
      newArchEnabled: true,
      ios: {
        supportsTablet: true,
        runtimeVersion: {
          policy: "appVersion"
        }
      },
      android: {
        googleServicesFile: "./google-services.json",
        config: {
          googleMaps: {
            // Use GOOGLE_API_KEY from .env here
            apiKey: process.env.GOOGLE_API_KEY
          }
        },
        adaptiveIcon: {
          foregroundImage: "./assets/images/icon.png",
          backgroundColor: "#0ea5ac"
        },
        edgeToEdgeEnabled: true,
        package: "com.anonymous.trafficapp",
        runtimeVersion: "2.0.0",
        versionCode: 5,
        permissions: [
          "ACCESS_FINE_LOCATION",
          "ACCESS_COARSE_LOCATION",
          "ACCESS_BACKGROUND_LOCATION",
          "FOREGROUND_SERVICE",
          "FOREGROUND_SERVICE_LOCATION"
        ]
      },
      web: {
        bundler: "metro",
        output: "static",
        favicon: "./assets/images/favicon.png"
      },
      plugins: [
        "expo-router",
        [
          "expo-splash-screen",
          {
            "image": "./assets/images/splashscreen.png",
            "imageWidth": 200,
            "resizeMode": "contain",
            "backgroundColor": "#0ea5ac"
          }
        ]
      ],
      experiments: {
        typedRoutes: true
      },
      // This is where we inject all environment variables for access via Expo.Constants
      extra: {
        router: {},
        eas: {
          projectId: "65586440-555e-4261-931f-832f25c339c0"
        },
        // All your Firebase config and the general Google API key go here
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
        FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
        FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
        FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
        FIREBASE_MEASUREMENT_ID: process.env.FIREBASE_MEASUREMENT_ID,
      },
      updates: {
        url: "https://u.expo.dev/65586440-555e-4261-931f-832f25c339c0"
      }
    }
  };
};