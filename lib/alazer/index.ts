import axios, { AxiosInstance } from "axios";

type AlazerOptions = {
  baseURL?: string;
};

export class Alazer {
  private api: AxiosInstance;

  constructor(options?: AlazerOptions) {
    let baseURL = options?.baseURL;
    if (typeof window !== "undefined" && !baseURL) {
      baseURL = window.location.origin;
    }
    this.api = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  async getNextIPs() {
    return (await this.api.get("/api/connection/server")).data;
  }
}
