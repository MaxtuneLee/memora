# Keep dataset and evaluation independent of Web

Dataset acquisition, storage, access, evaluation state, and metrics belong in reusable packages that do not depend on the Web application. Evaluation obtains predictions through narrow model adapters; the application hosts a separate dataset/evaluation SharedWorker and uses Window as a lightweight bridge to the existing model SharedWorkers, transferring inference data between them without coupling the reusable packages to application code.
