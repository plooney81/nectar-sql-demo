(ns build
  (:require [clojure.tools.build.api :as b]))

(def lib 'com.github.plooney81/nectar-sql-site)
(def version "0.1.0")
(def class-dir "target/classes")
(def basis (delay (b/create-basis {:project "deps.edn"})))
(def uber-file (format "target/%s-%s-standalone.jar" (name lib) version))

(defn clean [_]
  (b/delete {:path "target"}))

(defn compile-clj [_]
  (b/compile-clj {:basis     @basis
                  :src-dirs  ["src"]
                  :class-dir class-dir}))

(defn uber [_]
  (clean nil)
  (b/copy-dir {:src-dirs   ["src" "resources"]
               :target-dir class-dir})
  (compile-clj nil)
  (b/uber {:class-dir class-dir
           :uber-file uber-file
           :basis     @basis
           :main      'plooney81.nectar-sql-demo.server}))

(defn test [_]
  (let [basis (b/create-basis {:aliases [:test]})]
    (b/process {:command-args ["clojure" "-M:test"]
                :dir          "."})))

(defn ci [_]
  (test nil)
  (uber nil))
