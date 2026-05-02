(ns plooney81.nectar-sql-demo.server
  (:require [org.httpkit.server :as http]
            [compojure.core :refer [defroutes GET POST]]
            [compojure.route :as route]
            [ring.middleware.json :refer [wrap-json-body wrap-json-response]]
            [ring.middleware.resource :refer [wrap-resource]]
            [ring.middleware.content-type :refer [wrap-content-type]]
            [clojure.pprint :refer [pprint]]
            [clojure.string :as str]
            [plooney81.nectar.sql :as nsql])
  (:gen-class))

;; ── Constants ─────────────────────────────────────────────────────────────────

(def ^:private max-sql-length 10000)
(def ^:private rate-limit     30)   ; requests per window
(def ^:private rate-window-ms 60000) ; 1 minute

(def ^:private nsql-version
  (try
    (let [props (doto (java.util.Properties.)
                  (.load (.getResourceAsStream
                           (ClassLoader/getSystemClassLoader)
                           "META-INF/maven/com.github.plooney81/nectar-sql/pom.properties")))]
      (.getProperty props "version"))
    (catch Exception _ "unknown")))

;; ── Rate limiting (in-memory sliding window per IP) ───────────────────────────

(def ^:private request-log (atom {}))
(def ^:private cleanup-interval-ms (* 5 60 1000)) ; 5 minutes

(defn- client-ip [req]
  ;; Fly-Client-IP is injected by Fly's proxy and stripped from any client-supplied
  ;; value, so it cannot be spoofed. Fall back to X-Forwarded-For for local dev.
  (or (get-in req [:headers "fly-client-ip"])
      (some-> (get-in req [:headers "x-forwarded-for"])
              (str/split #",")
              first
              str/trim)
      (:remote-addr req)
      "unknown"))

(defn- allow-request? [ip]
  (let [now    (System/currentTimeMillis)
        cutoff (- now rate-window-ms)
        store  (swap! request-log
                      (fn [m]
                        (let [ts (filterv #(> % cutoff) (get m ip []))]
                          (assoc m ip (conj ts now)))))]
    (<= (count (get store ip [])) rate-limit)))

(defn- start-cleanup-thread! []
  (doto (Thread. (fn []
                   (while true
                     (Thread/sleep cleanup-interval-ms)
                     (let [cutoff (- (System/currentTimeMillis) rate-window-ms)]
                       (swap! request-log
                              (fn [m]
                                (into {} (remove (fn [[_ ts]]
                                                   (every? #(<= % cutoff) ts))
                                                 m))))))))
    (.setDaemon true)
    (.start)))

;; ── Security headers middleware ───────────────────────────────────────────────

(def ^:private csp
  (str "default-src 'none'; "
       "script-src 'self' https://cdnjs.cloudflare.com; "
       "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; "
       "connect-src 'self'; "
       "img-src 'self' data:; "
       "frame-ancestors 'none'; "
       "base-uri 'self'"))

(defn- wrap-security-headers [handler]
  (fn [req]
    (let [resp (handler req)]
      (update resp :headers merge
              {"X-Content-Type-Options" "nosniff"
               "X-Frame-Options"        "DENY"
               "Referrer-Policy"        "strict-origin-when-cross-origin"
               "Content-Security-Policy" csp}))))

;; ── Rate limit middleware ─────────────────────────────────────────────────────

(defn- wrap-rate-limit [handler]
  (fn [req]
    (if (allow-request? (client-ip req))
      (handler req)
      {:status  429
       :headers {"Retry-After" "60"}
       :body    {"error" "Too many requests — please wait a moment and try again."}})))

;; ── Handlers ──────────────────────────────────────────────────────────────────

(defn convert-handler [req]
  (let [sql (get-in req [:body "sql"])]
    (cond
      (nil? sql)
      {:status 400 :body {"error" "Missing required field: sql"}}

      (str/blank? sql)
      {:status 400 :body {"error" "SQL string cannot be empty"}}

      (> (count sql) max-sql-length)
      {:status 400 :body {"error" (str "SQL input exceeds maximum length of " max-sql-length " characters")}}

      :else
      (try
        {:status 200
         :body   {"honeysql" (with-out-str (pprint (nsql/ripen sql)))}}
        (catch Exception e
          {:status 400
           :body   {"error" (.getMessage e)}})))))

;; ── Routes ────────────────────────────────────────────────────────────────────

(defroutes app-routes
  (GET "/" []
    {:status  301
     :headers {"Location" "/index.html"}
     :body    ""})

  (GET "/health" []
    {:status 200
     :body   {"status" "ok" "nectar-sql-version" nsql-version}})

  (POST "/api/convert" req
    (convert-handler req))

  (route/not-found
    {:status 404
     :body   {"error" "Not found"}}))

;; ── App ───────────────────────────────────────────────────────────────────────

(def app
  (-> app-routes
      (wrap-resource "public")
      wrap-content-type
      (wrap-json-body {:keywords? false})
      wrap-json-response
      wrap-rate-limit
      wrap-security-headers))

;; ── Entry point ───────────────────────────────────────────────────────────────

(defn -main [& _]
  (let [port (Integer/parseInt (or (System/getenv "PORT") "8080"))]
    (start-cleanup-thread!)
    (println (str "nectar-sql server starting on port " port))
    (http/run-server app {:port port})
    (println "Server running. Press Ctrl+C to stop.")
    @(promise)))
