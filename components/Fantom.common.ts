/**
 * @fileoverview Utility functions for the Fantom search component.
 * @module components/Fantom.common
 * @description This module provides common utility functions for the Fantom search system,
 * including configuration loading, parameter validation, error handling, and Redis operations.
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@redis/client';
import { calculateScore } from '../common/utils';

/**
 * Loads and parses the Fantom configuration file.
 * @returns {Object} The parsed configuration object.
 * @throws {Error} If the configuration file cannot be loaded or parsed.
 * @example
 * // Load the Fantom configuration
 * const config = loadFantomConfig();
 */
export const loadFantomConfig = (): any => {
  try {
    // Get the path to the config file
    const configPath = path.resolve(__dirname, '../components/Fantom.config.jsonc');
    
    // Read the file
    const configContent = fs.readFileSync(configPath, 'utf8');
    
    // Remove comments from the JSONC content
    const jsonContent = configContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Parse the JSON
    const config = JSON.parse(jsonContent);
    
    return config;
  } catch (error) {
    console.error('Failed to load Fantom configuration:', error);
    // Return a default configuration or throw an error based on your requirements
    throw new Error(`Failed to load Fantom configuration: ${getErrorMessage(error)}`);
  }
};

/**
 * Validates the search query parameters.
 * @param {string} query - The search query string.
 * @param {Object} parameters - The search parameters object.
 * @param {string} parameters.type - The type of search algorithm.
 * @param {string[]} parameters.tags - The tags associated with the search.
 * @returns {boolean} A boolean indicating if the parameters are valid.
 * @example
 * // Validate search parameters
 * const isValid = validateSearchParams('example query', { type: 'fuzzy', tags: ['tag1', 'tag2'] });
 */
export const validateSearchParams = (
  query: string,
  parameters: { type: string; tags: string[] }
): boolean => {
  if (!query || typeof query !== 'string' || query.trim() === '') {
    return false;
  }

//   if (!parameters || typeof parameters !== 'object') {
//     return false;
//   }

//   const validTypes = ['fuzzy', 'bm25', 'colbert'];
//   if (!parameters.type || !validTypes.includes(parameters.type)) {
//     return false;
//   }

//   if (!Array.isArray(parameters.tags) || parameters.tags.length === 0) {
//     return false;
//   }

  return true;
};

/**
 * Parses scoped tags from the format "scope:value".
 * @param {string[]} tags - Array of tags, potentially in scoped format.
 * @returns {Object} Object with scopes as keys and values as arrays.
 * @example
 * // Parse scoped tags
 * const scopedTags = parseScopedTags(['scope1:value1', 'scope2:value2']);
 */
export const parseScopedTags = (tags: string[]): Record<string, string[]> => {
  const scopedTags: Record<string, string[]> = {};

  tags.forEach(tag => {
    const parts = tag.split(':');
    if (parts.length === 2) {
      const [scope, value] = parts;
      if (!scopedTags[scope]) {
        scopedTags[scope] = [];
      }
      scopedTags[scope].push(value);
    }
  });

  return scopedTags;
};

/**
 * Formats search results for API response.
 * @param {Array} results - The raw search results.
 * @param {string} query - The original query.
 * @returns {Object} Formatted results object.
 * @example
 * // Format search results
 * const formattedResults = formatSearchResults(rawResults, 'example query');
 */
export const formatSearchResults = (results: any[], query: string): object => {
  return {
    query,
    count: results.length,
    results,
    timestamp: new Date().toISOString()
  };
};

/**
 * Extracts error message from an error object.
 * @param {unknown} error - The error object.
 * @returns {string} A string error message.
 * @example
 * // Get error message
 * const errorMessage = getErrorMessage(new Error('Example error'));
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * Searches and sorts data from Redis based on a query.
 * @param {string} query - The search query string.
 * @param {string} userId - The user ID for algorithm selection.
 * @param {Object} config - The Fantom configuration object.
 * @returns {Promise<Array<{ key: string; value: any; score: number }>>} Array of sorted search results.
 * @example
 * // Search and sort from Redis
 * const results = await searchAndSortFromRedis('example query', 'user123', config);
 */
export const searchAndSortFromRedis = async (
    query: string,
    userId: string,
    algorithm: string,
    keyPattern: string = '*'
): Promise<Array<{ key: string; value: any; score: number }>> => {
    const client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        database: 5
    });

    const config = loadFantomConfig();
    
    try {
        await client.connect();
        // Use SCAN to iterate over keys matching the pattern
        const keys = [];
        let cursor = 0;
        do {
            const reply = await client.scan(cursor, { MATCH: keyPattern });
            cursor = reply.cursor;
            keys.push(...reply.keys);
        } while (cursor !== 0);

        const allValues = [];
        
        for (const key of keys) {
            const value = await client.get(key);
            try {
                const parsedValue = JSON.parse(value);
                const score = calculateScore(
                    query,
                    parsedValue,
                    algorithm || config.users.find(user => user.user_id === userId)?.algorithm || "bm25"
                );
                allValues.push({ key, value: parsedValue, score });
            } catch (e) {
                console.log("Error:", e);
                continue;
            }
        }
        
        return allValues
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .filter(item => item.score);
    } finally {
        await client.disconnect();
    }
};
